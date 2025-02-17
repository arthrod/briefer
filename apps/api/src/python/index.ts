import { Output, PythonErrorOutput } from '@briefer/types'
import * as services from '@jupyterlab/services'
import PQueue from 'p-queue'

import { logger } from '../logger.js'
import { getJupyterManager } from '../jupyter/index.js'
import prisma, { decrypt } from '@briefer/database'
import { config } from '../config/index.js'

export class PythonExecutionError extends Error {
  constructor(
    public etype: string,
    public ename: string,
    public evalue: string,
    public traceback: string[],
    message?: string
  ) {
    super(message ?? `${etype}: ${ename}: ${evalue}`)
    this.name = this.ename
  }

  public toPythonErrorOutput(): PythonErrorOutput {
    return {
      type: 'error',
      ename: this.ename,
      evalue: this.evalue,
      traceback: this.traceback,
    }
  }
}

export class PythonStderrError extends Error {
  constructor(
    public readonly workspaceId: string,
    public readonly sessionId: string,
    public readonly text: string,
    message?: string
  ) {
    super(
      message ??
        `Got stderr while executing Python code in workspace "${workspaceId}" session "${sessionId}"`
    )
    this.name = 'PythonStderrError'
  }
}

const getManager = async (workspaceId: string) => {
  const jupyterManager = getJupyterManager()
  const serverSettings = await jupyterManager.getServerSettings(workspaceId)
  const kernelManager = new services.KernelManager({ serverSettings })
  const sessionManager = new services.SessionManager({
    kernelManager,
    serverSettings,
  })

  return { kernelManager, sessionManager }
}

const executionQueues = new Map<string, PQueue>()
export async function executeCode(
  workspaceId: string,
  sessionId: string,
  code: string,
  onOutputs: (outputs: Output[]) => void,
  opts: { storeHistory: boolean }
) {
  const queueKey = `${workspaceId}-${sessionId}`
  let queue = executionQueues.get(queueKey)
  if (!queue) {
    queue = new PQueue({ concurrency: 1 })
    executionQueues.set(queueKey, queue)
  }

  let aborted = false
  let executing = false
  logger().debug(
    { workspaceId, sessionId, queueSize: queue.size },
    'Adding code to execution queue'
  )
  const promise = queue.add(async () => {
    if (aborted) {
      return
    }

    executing = true
    await innerExecuteCode(workspaceId, sessionId, code, onOutputs, opts)
  })

  return {
    async abort() {
      aborted = true

      if (executing) {
        const { kernel } = await getSession(workspaceId, sessionId)
        await kernel.interrupt()
        return
      }
    },
    promise,
  }
}

/**
 * Executes Python code in a Jupyter kernel session and processes the resulting outputs.
 *
 * This asynchronous function ensures that the Jupyter environment for the given workspace is up and running,
 * retrieves the kernel from a Jupyter session, and sends the provided code for execution. It listens for various
 * messages from the kernel (including status updates, streams, display data, execution results, and errors) and
 * forwards these outputs using the provided callback.
 *
 * A fallback mechanism is implemented using a timeout to ensure that the session does not hang if the usual
 * completion signal is not received. If the kernel restarts during execution, an error output is sent and the
 * function returns without throwing an exception.
 *
 * @param workspaceId - The unique identifier for the workspace.
 * @param sessionId - The identifier for the Jupyter session.
 * @param code - The Python code to be executed.
 * @param onOutputs - Callback function that receives an array of output objects representing various execution outputs.
 * @param options - Execution options.
 * @param options.storeHistory - Flag to indicate whether the code execution should be stored in history.
 *
 * @returns A promise that resolves when the code execution is complete.
 *
 * @throws Propagates errors encountered during code execution unless the kernel restarts, in which case the error
 *         is handled internally by outputting a specific error message.
 */
async function innerExecuteCode(
  workspaceId: string,
  sessionId: string,
  code: string,
  onOutputs: (outputs: Output[]) => void,
  { storeHistory }: { storeHistory: boolean }
): Promise<void> {
  logger().trace({ workspaceId, sessionId }, 'Starting Jupyter for code execution.')
  const jupyterManager = getJupyterManager()
  await jupyterManager.ensureRunning(workspaceId)
  logger().trace({ workspaceId, sessionId }, 'Jupyter is up.')

  const { kernel } = await getSession(workspaceId, sessionId)
  const future = kernel.requestExecute({
    code,
    allow_stdin: true,
    store_history: storeHistory,
  })

  let kernelRestarted = false
  kernel.statusChanged.connect((_, status) => {
    if (status === 'restarting' || status === 'autorestarting') {
      kernelRestarted = true
    }
  })

  future.onIOPub = (message) => {
    switch (message.header.msg_type) {
      case 'status':
        if ('execution_state' in message.content) {
          if (!['idle', 'busy'].includes(message.content.execution_state)) {
            logger().warn(
              {
                message: {
                  header: { msg_type: message.header.msg_type },
                  content: { execution_state: message.content.execution_state },
                },
              },
              'Got unexpected execution_state'
            )
          }
        } else {
          logger().warn({ message }, 'Got unsupported `status` message')
        }
        break
      case 'stream':
        if ('name' in message.content) {
          onOutputs([
            {
              type: 'stdio',
              name: message.content.name,
              text: message.content.text,
            },
          ])
        } else {
          logger().warn({ message }, 'Got unsupported `stream` message')
        }
        break
      case 'display_data':
      case 'execute_result':
        if (
          'data' in message.content &&
          'application/vnd.plotly.v1+json' in message.content.data &&
          message.content.data['application/vnd.plotly.v1+json'] &&
          typeof message.content.data['application/vnd.plotly.v1+json'] === 'object' &&
          'data' in message.content.data['application/vnd.plotly.v1+json']
          // :guitar:
        ) {
          onOutputs([
            {
              type: 'plotly',
              data: message.content.data['application/vnd.plotly.v1+json']['data'],
              layout: message.content.data['application/vnd.plotly.v1+json']['layout'],
            },
          ])
        } else if (
          'data' in message.content &&
          'image/png' in message.content.data &&
          typeof message.content.data['image/png'] === 'string'
        ) {
          onOutputs([
            {
              type: 'image',
              data: message.content.data['image/png'],
              format: 'png',
            },
          ])
        } else if ('data' in message.content && 'text/html' in message.content.data) {
          onOutputs([
            {
              type: 'html',
              html: message.content.data['text/html'] as string,
            },
          ])
        } else if ('data' in message.content && 'text/plain' in message.content.data) {
          onOutputs([
            {
              type: 'stdio',
              name: 'stdout',
              text: message.content.data['text/plain'] as string,
            },
          ])
        } else {
          logger().warn({ message }, `Got unsupported \`${message.header.msg_type}\` message`)
        }
        break
      case 'error':
        if (
          'ename' in message.content &&
          'evalue' in message.content &&
          'traceback' in message.content
        ) {
          onOutputs([
            {
              type: 'error',
              ename: message.content.ename,
              evalue: message.content.evalue,
              traceback: message.content.traceback,
            },
          ])
        } else {
          logger().warn({ message }, 'Got unsupported `error` message')
        }
        break
      case 'execute_input':
        break
      default:
        logger().warn({ message }, 'Got unsupported message type')
    }
  }

  logger().debug({ workspaceId, sessionId }, 'Waiting for code to execute')
  try {
    // For some reason, future.done not always resolves.
    // These fallbacks are here just to ensure the session won't
    // be stuck.
    // TODO: We need to eventually get to the bottom of this.
    let timeout: NodeJS.Timeout | null = null
    let done = false
    let status = kernel.status
    logger().trace(
      {
        workspaceId,
        sessionId,
        status,
      },
      'Waiting for kernel to become idle'
    )
    const idlePromise = new Promise<void>((resolve) => {
      function onStatusChanged(
        _: services.Kernel.IKernelConnection,
        newStatus: services.Kernel.Status
      ) {
        if (done) {
          return
        }

        logger().trace(
          {
            workspaceId,
            sessionId,
            status: newStatus,
          },
          'Kernel status changed'
        )

        if (status === newStatus) {
          return
        }

        if (timeout) {
          logger().trace({ workspaceId, sessionId, status, newStatus }, 'Clearing timeout')
          clearTimeout(timeout)
        }

        if (newStatus === 'idle') {
          logger().trace({ workspaceId, sessionId, status, newStatus }, 'Setting timeout')
          timeout = setTimeout(() => {
            if (!done) {
              logger().trace({ workspaceId, sessionId, status, newStatus }, 'Timeout reached')
              done = true
            }

            kernel.statusChanged.disconnect(onStatusChanged)
            resolve()
          }, 60000)
        }
        status = newStatus
      }

      kernel.statusChanged.connect(onStatusChanged)
      if (status === 'idle') {
        logger().trace({ workspaceId, sessionId, status }, 'Initial idle status, setting timeout')
        timeout = setTimeout(() => {
          if (!done) {
            done = true
          }

          kernel.statusChanged.disconnect(onStatusChanged)
          resolve()
        }, 60000)
      }
    })

    await Promise.race([future.done, idlePromise])
    done = true
  } catch (err) {
    if (kernelRestarted) {
      onOutputs([
        {
          type: 'error',
          ename: 'KernelRestarted',
          evalue: 'Kernel restarted during execution. Ran out of memory.',
          traceback: [],
        },
      ])
      return
    }
    throw err
  }
  logger().debug({ workspaceId, sessionId }, 'Code finished executing')
}

export async function cancelExecution(workspaceId: string, sessionId: string) {
  const { kernel } = await getSession(workspaceId, sessionId)
  await kernel.interrupt()
}

async function setEnvironmentVariables(
  kernel: services.Kernel.IKernelConnection,
  variables: { add: { name: string; value: string }[]; remove: string[] }
) {
  const code = ['import os']
    .concat(variables.remove.map((v) => `os.environ.pop('${v}', None)`))
    .concat(variables.add.map((v) => `os.environ['${v.name}'] = '${v.value}'`))
    .join('\n')

  await kernel.requestExecute({
    code,
    store_history: false,
  }).done
}

async function startNewSession(
  sessionManager: services.SessionManager,
  workspaceId: string,
  sessionId: string
) {
  const session = await sessionManager.startNew({
    path: sessionId,
    type: 'notebook',
    name: sessionId,
    kernel: {
      name: 'python',
    },
  })

  if (!session.kernel) {
    throw new Error('session.kernel is null')
  }

  const encryptedVariables = await prisma().environmentVariable.findMany({
    where: { workspaceId },
  })

  const variables = encryptedVariables.map((v) => ({
    name: decrypt(v.name, config().ENVIRONMENT_VARIABLES_ENCRYPTION_KEY),
    value: decrypt(v.value, config().ENVIRONMENT_VARIABLES_ENCRYPTION_KEY),
  }))

  await setEnvironmentVariables(session.kernel, {
    add: variables,
    remove: [],
  })

  return session
}

type Jupyter = {
  session: services.Session.ISessionConnection
  kernel: services.Kernel.IKernelConnection
}
const sessions = new Map<string, Jupyter>()
/**
 * Retrieves or creates a Jupyter session for the specified workspace and session.
 *
 * This function checks if a session (and its corresponding kernel) for the given workspace and session ID
 * exists in the cache. If a cached session is found and its kernel is connected, that session is returned.
 * Otherwise, any existing session is disposed and removed from the cache. The function then attempts to
 * find an existing session model via the session manager; if found, it reconnects to it, otherwise it initiates
 * a new session using a retry mechanism. An error is thrown if the resulting session does not have an associated kernel.
 *
 * @param workspaceId - The identifier of the workspace.
 * @param sessionId - The identifier of the session.
 * @returns A Promise that resolves with a Jupyter session object containing both the session and its kernel.
 *
 * @throws Error if the session's kernel is null.
 */
async function getSession(workspaceId: string, sessionId: string): Promise<Jupyter> {
  const key = `${workspaceId}-${sessionId}`
  let jupyter = sessions.get(key)
  if (jupyter) {
    if (jupyter.kernel.connectionStatus === 'connected') {
      return jupyter
    }

    jupyter.kernel.dispose()
    jupyter.session.dispose()
    sessions.delete(key)
  }

  const { sessionManager } = await getManager(workspaceId)
  let sessionModel = await sessionManager.findByPath(sessionId)

  const session = sessionModel
    ? sessionManager.connectTo({ model: sessionModel })
    : await withRetry(() => startNewSession(sessionManager, workspaceId, sessionId))

  if (!session.kernel) {
    throw new Error('session.kernel is null')
  }

  jupyter = { session: session, kernel: session.kernel }
  sessions.set(key, jupyter)
  return jupyter
}

/**
 * Updates environment variables for all active sessions associated with the given workspace.
 *
 * This asynchronous function iterates through all sessions in the session cache,
 * identifies those whose key starts with the provided workspace ID, and updates
 * their environment variables by calling the `setEnvironmentVariables` function.
 * The updates include both adding new environment variables and removing specified ones.
 *
 * @param workspaceId - The identifier of the workspace whose sessions will be updated.
 * @param variables - An object containing:
 *   - `add`: An array of objects with `name` and `value` properties specifying the variables to add.
 *   - `remove`: An array of environment variable names that should be removed.
 * @returns A promise that resolves when all matching sessions have been updated.
 */
export async function updateEnvironmentVariables(
  workspaceId: string,
  variables: { add: { name: string; value: string }[]; remove: string[] }
) {
  await Promise.all(
    Array.from(sessions.entries()).map(async ([key, { kernel }]) => {
      if (key.startsWith(workspaceId)) {
        await setEnvironmentVariables(kernel, variables)
      }
    })
  )
}

/**
 * Executes an asynchronous function with a retry mechanism using exponential backoff.
 *
 * This function attempts to execute the provided asynchronous function up to a specified number of retry attempts.
 * If the function fails, it waits for an exponentially increasing delay (capped by a maximum timeout) before retrying.
 * If all retry attempts fail, the error from the final attempt is thrown.
 *
 * @param fn - The asynchronous function to execute.
 * @param maxRetries - The maximum number of retry attempts. Defaults to 5.
 * @param maxTimeout - The maximum delay in milliseconds between retries. Defaults to 15000.
 * @returns A promise resolving with the result of the asynchronous function if successful.
 *
 * @throws The error from the final attempt if the function fails on all retries.
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 5, maxTimeout = 15000): Promise<T> {
  let attempt = 1
  while (attempt <= maxRetries) {
    try {
      return await fn()
    } catch (err) {
      if (attempt === maxRetries) {
        throw err
      }

      logger().warn({ attempt, err }, 'Retrying')
      attempt++
      // exponential backoff
      await new Promise((resolve) => setTimeout(resolve, Math.min(2 ** attempt * 1000, maxTimeout)))
    }
  }

  return fn()
}

export async function getCompletion(
  workspaceId: string,
  sessionId: string,
  code: string,
  position: number
) {
  const jupyterManager = getJupyterManager()
  await jupyterManager.ensureRunning(workspaceId)

  const { kernel } = await getSession(workspaceId, sessionId)

  return kernel.requestComplete({
    code,
    cursor_pos: position,
  })
}

export async function renderJinja(
  workspaceId: string,
  sessionId: string,
  template: string
): Promise<string | PythonErrorOutput> {
  const code = `
def _briefer_render_template():
  from jinja2 import Template
  import json
  result = json.dumps({"type": "success", "result": Template(${JSON.stringify(
    template
  )}).render(**globals())})
  print(result)

_briefer_render_template()
del _briefer_render_template`

  let result: string | PythonErrorOutput | null = null
  const { promise } = await executeCode(
    workspaceId,
    sessionId,
    code,
    (outputs) => {
      for (const output of outputs) {
        if (output.type === 'stdio' && output.name === 'stdout') {
          const lines = output.text.trim().split('\n')
          for (const line of lines) {
            const parsed = JSON.parse(line.trim())
            switch (parsed.type) {
              case 'success':
                result = parsed.result
                break
              default:
                throw new Error('Unexpected output: ' + line)
            }
          }
        } else if (output.type === 'error') {
          result = {
            type: 'error',
            ename: output.ename,
            evalue: output.evalue,
            traceback: output.traceback,
          }
        }
      }
    },
    { storeHistory: false }
  )
  await promise

  if (!result) {
    throw new Error('Got no result from rendering template')
  }

  return result
}

export async function disposeAll(workspaceId: string) {
  await Promise.all(
    Array.from(sessions.entries()).map(async ([key, { kernel, session }]) => {
      if (key.startsWith(workspaceId)) {
        await session.shutdown()
        await kernel.shutdown()
        session.dispose()
        kernel.dispose()
      }
    })
  )
  sessions.clear()
}
