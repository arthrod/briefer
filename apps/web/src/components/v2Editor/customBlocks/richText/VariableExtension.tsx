import { Node, NodeViewProps, mergeAttributes } from '@tiptap/core'
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

const VariableNodeView: React.FC<NodeViewProps> = ({ node }) => {
  return (
    <NodeViewWrapper as="span" className="inline-block">
      <span
        contentEditable={false}
        className="inline-flex items-center whitespace-nowrap rounded bg-blue-100 px-1.5 text-sm text-blue-800"
        style={{ lineHeight: '1.2em' }}>
        {node.attrs.text}
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
          const match = value.match(/\{([^}]{1,30})\}/)
          if (!match) {
            return false
          }
          const from = value.indexOf(match[0]) + 1
          const to = from + match[0].length
          if (match) {
            commands.deleteRange({ from: from, to })
            return commands.insertContentAt(from, {
              type: this.name,
              attrs: { text: match[1] },
            })
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
          editor.commands.setVariable(match[1])
          return true
        }

        return false
      },
    }
  },
})
