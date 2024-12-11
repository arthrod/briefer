import { JSONContent, Node, NodeViewProps, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import React from 'react'
import { NodeViewWrapper } from '@tiptap/react'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    variable: {
      setVariable: (value: string) => ReturnType
    }
  }
}

const serializeNodes = (node: JSONContent): any => {
  if (!node) {
    return
  }
  if (node.type === 'variable' && node.attrs) {
    return `{${node.attrs.text}}`
  }
  if (node.content) {
    return node.content.map(serializeNodes).join('')
  }
  return node.text || ''
}

const VariableNodeView: React.FC<NodeViewProps> = ({ node }) => {
  return (
    <NodeViewWrapper as="span" className="inline-block">
      <span
        contentEditable={false}
        className="inline-flex items-center whitespace-nowrap rounded bg-blue-100 px-1.5 text-sm text-blue-800"
        style={{ lineHeight: '1.2em' }}>
        {node.attrs.value}
      </span>
    </NodeViewWrapper>
  )
}

export interface VariableOptions {
  HTMLAttributes: Record<string, any>
}

export default Node.create<VariableOptions>({
  name: 'variable',

  group: 'inline',

  inline: true,

  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  addAttributes() {
    return {
      value: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-value'),
        renderHTML: (attributes) => {
          return {
            'data-value': attributes.value,
          }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="variable"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { 'data-type': 'variable' }),
      0,
    ]
  },

  addCommands() {
    return {
      setVariable:
        (value) =>
        ({ commands }) => {
          const matchs = Array.from(value.matchAll(/\{([^}]{1,30})\}/g))
          if (matchs && matchs.length > 0) {
            for (let index = matchs.length - 1; index >= 0; index--) {
              const match = matchs[index]
              if (!match) {
                return false
              }
              const from = match.index + 1
              const to = from + match[0].length
              if (match) {
                commands.deleteRange({ from: from, to })
                commands.insertContentAt(from, {
                  type: this.name,
                  attrs: { value: match[1] },
                })
              }
            }
            return true
          }

          return false
        },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(VariableNodeView)
  },

  addKeyboardShortcuts() {
    return {
      Space: ({ editor }) => {
        const { selection } = editor.state
        const { empty, from } = selection

        if (!empty) {
          return false
        }

        const currentNode = editor.state.doc.nodeAt(from - 1)
        if (!currentNode) {
          return false
        }

        const text = currentNode.text
        if (!text) {
          return false
        }

        const match = text.match(/\{([^}]{1,30})\}/)
        if (match) {
          editor.commands.deleteRange({ from: from - match[0].length, to: from })
          editor.commands.insertContentAt(from - match[0].length, {
            type: this.name,
            attrs: { value: match[1] },
          })
          return true
        }

        return false
      },
    }
  },
})
