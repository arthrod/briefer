import clsx from 'clsx'
import { ReactNode, forwardRef } from 'react'
import SimpleBar from 'simplebar-react'

interface Props extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  className?: string
  disabled?: boolean
}
const ScrollBar = forwardRef<HTMLDivElement, Props>(
  function ScrollBar(props, ref) {
    return (
      <SimpleBar
        className={clsx('no-scrollbar', props.className)}
        scrollableNodeProps={{
          ref,
        }}
      >
        {props.children}
      </SimpleBar>
    )
  }
)

export default ScrollBar
