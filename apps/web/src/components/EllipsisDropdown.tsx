import {
  BookOpenIcon,
  ClockIcon,
  CodeBracketSquareIcon,
  Cog6ToothIcon,
  MapIcon,
} from '@heroicons/react/24/outline'
import { ArrowLeftIcon, ArrowRightIcon } from '@heroicons/react/20/solid'
import { Menu, MenuItems, MenuItem, MenuButton, Transition } from '@headlessui/react'
import { EllipsisHorizontalIcon, InboxArrowDownIcon, FolderIcon } from '@heroicons/react/24/outline'
import { ChatBubbleBottomCenterTextIcon } from '@heroicons/react/24/outline'

interface Props {
  onToggleSchedules: () => void
  onToggleSnapshots: () => void
  onToggleComments: () => void
  onToggleFullScreen?: () => void
  onToggleFiles?: () => void
  onToggleSchemaExplorer?: () => void
  onToggleShortcuts?: () => void
  onTogglePageSettings?: () => void
  onToggleReusableComponents?: () => void
  isViewer: boolean
  isDeleted: boolean
  isFullScreen: boolean
}
function EllipsisDropdown(props: Props) {
  return (
    <Menu as="div" className="relative h-full">
      <MenuButton className="flex h-full items-center rounded-sm border border-gray-200 bg-white px-3 py-1 text-sm text-gray-500 hover:bg-gray-100">
        <EllipsisHorizontalIcon className="h-4 w-4" />
      </MenuButton>
      <Transition
        as="div"
        className="absolute right-0 z-40"
        enter="transition-opacity duration-300"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="transition-opacity duration-300"
        leaveFrom="opacity-100"
        leaveTo="opacity-0">
        <MenuItems
          as="div"
          className="mt-1 w-52 divide-y divide-gray-200 rounded-md bg-white font-sans shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
          {props.onToggleFiles && (
            <MenuItemButton
              icon={<FolderIcon className="h-4 w-4" />}
              text="Files"
              onClick={props.onToggleFiles}
            />
          )}
          {!props.isViewer && !props.isDeleted && (
            <>
              <MenuItemButton
                icon={<ClockIcon className="h-4 w-4" />}
                text="Schedules"
                onClick={props.onToggleSchedules}
              />
              <MenuItemButton
                icon={<InboxArrowDownIcon className="h-4 w-4" />}
                text="Snapshots"
                onClick={props.onToggleSnapshots}
              />
            </>
          )}

          <MenuItemButton
            icon={<ChatBubbleBottomCenterTextIcon className="h-4 w-4" />}
            text="Comments"
            onClick={props.onToggleComments}
          />

          {props.onToggleSchemaExplorer && (
            <MenuItemButton
              icon={<BookOpenIcon className="h-4 w-4" />}
              text="Schema explorer"
              onClick={props.onToggleSchemaExplorer}
            />
          )}

          {props.onToggleFullScreen && (
            <MenuItemButton
              icon={
                <div className="flex items-center">
                  {props.isFullScreen ? (
                    <>
                      <ArrowRightIcon className="h-3 w-3" />
                      <ArrowLeftIcon className="h-3 w-3" />
                    </>
                  ) : (
                    <>
                      <ArrowLeftIcon className="h-3 w-3" />
                      <ArrowRightIcon className="h-3 w-3" />
                    </>
                  )}
                </div>
              }
              text={props.isFullScreen ? 'Shrink horizontally' : 'Stretch horizontally'}
              onClick={props.onToggleFullScreen}
            />
          )}

          {props.onToggleReusableComponents && (
            <MenuItemButton
              icon={<CodeBracketSquareIcon className="h-4 w-4" />}
              text="Reusable components"
              onClick={props.onToggleReusableComponents}
            />
          )}

          {props.onToggleShortcuts && (
            <MenuItemButton
              icon={<MapIcon className="h-4 w-4" />}
              text="Keyboard shortcuts"
              onClick={props.onToggleShortcuts}
            />
          )}

          {props.onTogglePageSettings && (
            <MenuItemButton
              icon={<Cog6ToothIcon className="h-4 w-4" />}
              text="Page settings"
              onClick={props.onTogglePageSettings}
            />
          )}
        </MenuItems>
      </Transition>
    </Menu>
  )
}

interface MenuButtonProps {
  icon?: JSX.Element
  text: string
  onClick: () => void
}

function MenuItemButton(props: MenuButtonProps) {
  return (
    <MenuItem
      as="button"
      onClick={props.onClick}
      type="button"
      className="flex w-full items-center gap-x-2 rounded-sm px-4 py-2 text-sm text-gray-500 hover:bg-gray-100">
      <div className="flex w-6 justify-center">{props.icon}</div>
      <span>{props.text}</span>
    </MenuItem>
  )
}

export default EllipsisDropdown
