import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BubbleMenu, Editor } from '@tiptap/react'
import { Level } from '@tiptap/extension-heading'
import { Menu, Transition } from '@headlessui/react'
import { ChevronDownIcon } from '@heroicons/react/20/solid'
import { SwatchIcon } from '@heroicons/react/24/outline'
import clsx from 'clsx'
import { CheckIcon, LinkIcon } from '@heroicons/react/24/solid'

type NodeType =
  | 'paragraph'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'bullet-list'
  | 'numbered-list'
  | 'task-list'

const items: Record<NodeType, { name: string; type: NodeType }> = {
  paragraph: { name: 'Paragraph', type: 'paragraph' },
  'heading-1': { name: 'Heading 1', type: 'heading-1' },
  'heading-2': { name: 'Heading 2', type: 'heading-2' },
  'heading-3': { name: 'Heading 3', type: 'heading-3' },
  'bullet-list': { name: 'Bullet list', type: 'bullet-list' },
  'numbered-list': { name: 'Numbered list', type: 'numbered-list' },
  'task-list': { name: 'Task list', type: 'task-list' },
}

const getCurrentType = (editor: Editor): NodeType => {
  const isHeading = editor.isActive('heading')
  if (isHeading) {
    const level = editor.getAttributes('heading').level
    switch (level) {
      case 1:
        return 'heading-1'
      case 2:
        return 'heading-2'
      case 3:
        return 'heading-3'
    }
  }

  const isBulletList = editor.isActive('bulletList')
  if (isBulletList) return 'bullet-list'

  const isOrderedList = editor.isActive('orderedList')
  if (isOrderedList) return 'numbered-list'

  const isTaskList = editor.isActive('taskList')
  if (isTaskList) return 'task-list'

  return 'paragraph'
}

const NodeTypeDropdown = ({ editor }: { editor: Editor }) => {
  const currentType: NodeType = getCurrentType(editor)

  const setNodeType = useCallback(
    (nodeType: NodeType) => {
      switch (nodeType) {
        case 'paragraph':
          editor.chain().focus().setParagraph().run()
          break
        case 'heading-1':
          editor.chain().focus().setHeading({ level: 1 }).run()
          break
        case 'heading-2':
          editor.chain().focus().setHeading({ level: 2 }).run()
          break
        case 'heading-3':
          editor.chain().focus().setHeading({ level: 3 }).run()
          break
        case 'bullet-list':
          editor.chain().focus().toggleBulletList().run()
          break
        case 'numbered-list':
          editor.chain().focus().toggleOrderedList().run()
          break
        case 'task-list':
          editor.chain().focus().toggleTaskList().run()
          break
      }
    },
    [editor]
  )

  return (
    <div className="inline-flex">
      <Menu as="div" className="relative block">
        <Menu.Button className="relative inline-flex items-center gap-x-1 rounded-md px-1.5 py-1.5 hover:bg-gray-100">
          {items[currentType].name}
          <ChevronDownIcon className="h-4 w-4" aria-hidden="true" />
        </Menu.Button>
        <Transition
          as={Fragment}
          enter="transition ease-out duration-100"
          enterFrom="transform opacity-0 scale-95"
          enterTo="transform opacity-100 scale-100"
          leave="transition ease-in duration-75"
          leaveFrom="transform opacity-100 scale-100"
          leaveTo="transform opacity-0 scale-95">
          <Menu.Items className="absolute right-0 z-10 -mr-1 mt-2 origin-top-right whitespace-nowrap rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
            <div className="py-0.5">
              {Object.values(items).map((item) => (
                <Menu.Item key={item.name}>
                  {({ active }) => (
                    <button
                      onClick={() => setNodeType(item.type)}
                      className={clsx(
                        active ? 'bg-gray-100 text-gray-900' : 'text-gray-700',
                        'block w-full px-4 py-2 text-left'
                      )}>
                      {item.name}
                    </button>
                  )}
                </Menu.Item>
              ))}
            </div>
          </Menu.Items>
        </Transition>
      </Menu>
    </div>
  )
}

const ToggleFormattingButton = (props: {
  children: React.ReactNode
  name: string
  shortcut: string
  type: string
  onToggle: () => void
  editor: Editor
}) => {
  const isActive = props.editor.isActive(props.type)

  return (
    <button
      onClick={props.onToggle}
      className={clsx(
        isActive ? 'bg-gray-100' : '',
        'group/toggle-button relative h-full rounded-md px-2.5 text-sm hover:bg-gray-100'
      )}>
      {props.children}
      <span className="sr-only">{props.name}</span>
      <div className="bg-hunter-950 pointer-events-none absolute -top-2 left-1/2 flex w-max -translate-x-1/2 -translate-y-full flex-col gap-y-1 rounded-md p-2 font-sans text-xs text-white opacity-0 shadow-lg transition-opacity group-hover/toggle-button:opacity-100">
        <span>{props.name}</span>
        <span className="flex items-center justify-center gap-x-0.5 text-xs text-gray-400">
          {props.shortcut.split('').map((key, index) => {
            return <span key={key + index}>{key}</span>
          })}
        </span>
      </div>
    </button>
  )
}

type ColorSpec = { name: string; type: 'fg' | 'bg'; hex: string }
const bgColors: ColorSpec[] = [
  { name: 'Default', type: 'bg', hex: 'transparent' },
  { name: 'Gray', type: 'bg', hex: '#ebeced' },
  { name: 'Brown', type: 'bg', hex: '#e9e5e3' },
  { name: 'Orange', type: 'bg', hex: '#f6e9d9' },
  { name: 'Yellow', type: 'bg', hex: '#fbf3db' },
  { name: 'Green', type: 'bg', hex: '#ddedea' },
  { name: 'Blue', type: 'bg', hex: '#ddebf1' },
  { name: 'Purple', type: 'bg', hex: '#eae4f2' },
  { name: 'Pink', type: 'bg', hex: '#f4dfeb' },
  { name: 'Red', type: 'bg', hex: '#fbe4e4' },
]

const textColors: ColorSpec[] = [
  // This corresponds to --tw-prose-body
  { name: 'Default', type: 'fg', hex: '#374151' },
  { name: 'Gray', type: 'fg', hex: '#9b9a97' },
  { name: 'Brown', type: 'fg', hex: '#64473a' },
  { name: 'Orange', type: 'fg', hex: '#d9730d' },
  { name: 'Yellow', type: 'fg', hex: '#dfab01' },
  { name: 'Green', type: 'fg', hex: '#4d6461' },
  { name: 'Blue', type: 'fg', hex: '#0b6e99' },
  { name: 'Purple', type: 'fg', hex: '#6940a5' },
  { name: 'Pink', type: 'fg', hex: '#ad1a72' },
  { name: 'Red', type: 'fg', hex: '#e03e3e' },
]

const ColorOption = (props: {
  color: ColorSpec
  onShiftColor: (color: ColorSpec) => void
  isSelected: boolean
}) => {
  return (
    <button
      className="flex w-full items-center gap-x-1 rounded-md px-2 py-1 hover:bg-gray-100"
      onClick={() => props.onShiftColor(props.color)}>
      <div
        className="rounded-md border border-gray-200 p-0.5"
        style={{
          backgroundColor: props.color.type === 'bg' ? props.color.hex : '#fff',
          color: props.color.type === 'fg' ? props.color.hex : '#000',
        }}>
        <span className="px-1 text-[10px]">A</span>
      </div>
      <div className="flex w-full items-center justify-between gap-x-8">
        <span>{props.color.name}</span>
        <span className={clsx({ 'opacity-0': !props.isSelected })}>
          <CheckIcon className="h-3 w-3 text-gray-600" />
        </span>
      </div>
    </button>
  )
}

const ColorTextButton = (props: { editor: Editor }) => {
  const [showColorsMenu, setShowColorsMenu] = useState(false)

  const toggleShowColorsMenu = useCallback(() => {
    setShowColorsMenu((prev) => !prev)
  }, [setShowColorsMenu])

  const currentColor = props.editor.getAttributes('textStyle').color
  const currentBgColor = props.editor.getAttributes('highlight').color

  const onShiftColor = useCallback(
    (color: ColorSpec) => {
      if (color.type === 'bg') {
        props.editor.chain().focus().setHighlight({ color: color.hex }).run()
      } else {
        props.editor.commands.setColor(color.hex)
      }
    },
    [props.editor]
  )

  useEffect(() => {
    if (props.editor.view.state.selection.empty) {
      setShowColorsMenu(false)
    }
  }, [setShowColorsMenu, props.editor.view.state.selection.empty])

  return (
    <div className="group/toggle-button relative h-full py-[1px] pr-0.5">
      <button
        onClick={toggleShowColorsMenu}
        className={clsx(
          'relative h-full overflow-hidden rounded-md px-2.5 text-sm ring-1 ring-inset ring-gray-200'
        )}
        style={{
          color: currentColor ?? 'inherit',
          backgroundColor: currentBgColor ?? 'inherit',
        }}>
        <div className="absolute left-0 top-0 flex h-full w-full items-center justify-center hover:bg-gray-100/30" />
        <span className="text-xs font-bold">A</span>
      </button>

      <div className="bg-hunter-950 pointer-events-none absolute -top-2 left-1/2 flex w-max -translate-x-1/2 -translate-y-full flex-col gap-y-1 rounded-md p-2 font-sans text-xs text-white opacity-0 shadow-lg transition-opacity group-hover/toggle-button:opacity-100">
        <span>Colors</span>
      </div>

      {showColorsMenu && (
        <div className="absolute bottom-0 left-1/2 flex -translate-x-1/2 translate-y-[calc(100%+8px)] gap-x-2 rounded-md border border-gray-200 bg-white px-1 py-2 shadow-md">
          <div className="flex flex-col gap-y-1">
            <span className="px-2 font-medium">Text</span>
            {textColors.map((color) => (
              <ColorOption
                key={color.name}
                color={color}
                onShiftColor={onShiftColor}
                isSelected={
                  (color.name === 'Default' && !currentColor) || color.hex === currentColor
                }
              />
            ))}
          </div>
          <div className="flex flex-col gap-y-1">
            <span className="px-2 font-medium">Background</span>
            {bgColors.map((color) => (
              <ColorOption
                key={color.name}
                color={color}
                onShiftColor={onShiftColor}
                isSelected={
                  (color.name === 'Default' && !currentBgColor) || color.hex === currentBgColor
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const AddLinkButton = (props: {
  children: React.ReactNode
  onLink: (url: string) => void
  onUnlink: () => void
  editor: Editor
}) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [showLinkForm, setShowLinkForm] = useState(false)
  const [url, setUrl] = useState('')

  const isActive = props.editor.getAttributes('link').href

  const toggleShowLinkForm = useCallback(() => {
    setShowLinkForm((prev) => {
      if (!prev) {
        setTimeout(() => inputRef.current?.focus(), 0)
      } else {
        setUrl('')
      }

      return !prev
    })
  }, [setShowLinkForm, setUrl])

  const onClickLinkButton = useCallback(() => {
    if (isActive) {
      props.onUnlink()
      return
    }

    toggleShowLinkForm()
  }, [isActive, props.editor, toggleShowLinkForm])

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      props.onLink(url)
      toggleShowLinkForm()
    },
    [props.onLink, url, toggleShowLinkForm]
  )

  useEffect(() => {
    if (props.editor.view.state.selection.empty) {
      setShowLinkForm(false)
    }
  }, [toggleShowLinkForm, props.editor.view.state.selection.empty])

  return (
    <div className="relative h-full">
      <button
        onClick={onClickLinkButton}
        className={clsx(
          isActive ? 'bg-gray-100' : '',
          'group/toggle-button relative h-full rounded-md px-2.5 text-sm hover:bg-gray-100'
        )}>
        {props.children}
      </button>
      <form
        className={clsx(
          'absolute left-1/2 top-0 flex h-8 -translate-x-1/2 -translate-y-[calc(100%+8px)] items-center gap-x-1.5 rounded-md bg-white p-1.5 shadow-md ring-1 ring-inset ring-gray-300',
          { hidden: !showLinkForm }
        )}
        onSubmit={onSubmit}>
        <input
          className="w-40 w-48 rounded-sm border-0 px-1 py-0.5 text-xs placeholder-gray-300 ring-1 ring-gray-200 focus:outline-none focus:ring-1 focus:ring-gray-300"
          placeholder="Enter a link and press Enter"
          ref={inputRef}
          onChange={(e) => setUrl(e.target.value)}
          value={url}
        />
        <button
          type="submit"
          className="bg-primary-100 hover:bg-primary-200 ring-primary-400 h-full rounded-sm px-2 ring-1">
          <CheckIcon className="h-4 w-4 text-gray-600" />
        </button>
      </form>
    </div>
  )
}

const FormattingToolbar = ({ editor }: { editor: Editor }) => {
  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{
        hideOnClick: true,
        placement: 'top-start',
        popperOptions: {
          strategy: 'fixed',
          modifiers: [
            {
              name: 'flip',
              options: {
                fallbackPlacements: ['bottom', 'right'],
              },
            },
          ],
        },
        duration: 100,
      }}
      className="flex divide-x divide-gray-200 rounded-md bg-white py-1 text-xs text-gray-600 shadow-md ring-1 ring-inset ring-gray-300">
      <div className="flex items-center justify-center gap-x-1 px-1">
        <NodeTypeDropdown editor={editor} />
      </div>

      <div className="flex items-center justify-center gap-x-1 px-1">
        <ToggleFormattingButton
          name="Bold"
          shortcut="⌘+b"
          type="bold"
          onToggle={() => editor.chain().focus().toggleBold().run()}
          editor={editor}>
          <strong>B</strong>
        </ToggleFormattingButton>
        <ToggleFormattingButton
          name="Italic"
          shortcut="⌘+i"
          type="italic"
          onToggle={() => editor.chain().focus().toggleItalic().run()}
          editor={editor}>
          <em className="italic">i</em>
        </ToggleFormattingButton>

        <ToggleFormattingButton
          name="Underline"
          shortcut="⌘+u"
          type="underline"
          onToggle={() => editor.commands.toggleUnderline()}
          editor={editor}>
          <u className="underline">U</u>
        </ToggleFormattingButton>

        <ToggleFormattingButton
          name="Strikethrough"
          shortcut="⌘+⇧+x"
          type="strike"
          onToggle={() => editor.chain().focus().toggleStrike().run()}
          editor={editor}>
          <s className="line-through">S</s>
        </ToggleFormattingButton>

        <ColorTextButton editor={editor} />
      </div>

      <div className="flex items-center justify-center gap-x-1 px-1">
        <AddLinkButton
          onLink={(url) => {
            editor.chain().setLink({ href: url }).run()
          }}
          onUnlink={() => {
            editor.chain().focus().unsetLink().run()
          }}
          editor={editor}>
          <LinkIcon className="h-4 w-4" />
        </AddLinkButton>
      </div>
    </BubbleMenu>
  )
}

export default FormattingToolbar
