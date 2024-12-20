import { useState } from 'react'
import styles from './index.module.scss'
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import clsx from 'clsx'
import { useRouter } from 'next/router'
import { useSession } from '@/hooks/useAuth'

const UserAvatar = () => {
  const [isOpen, setIsOpen] = useState(false)
  const router = useRouter()
  const session = useSession()

  const firstLetter = session.data?.loginName.charAt(0).toUpperCase() // 获取用户名的第一个字母并转为大写

  return (
    <Popover className={styles.userAvatarPopover}>
      <PopoverButton
        style={{ outline: 'none' }}
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen(!isOpen)
        }}>
        <div className={styles.userAvatar}>{firstLetter}</div>
      </PopoverButton>
      <PopoverPanel
        anchor={{ to: 'bottom' }}
        className={clsx(
          'pointer-events-auto z-[100] -translate-x-4 shadow-lg',
          styles.userAvatarPopoverLayout
        )}
        style={{ marginTop: '8px' }}>
        {({ close }) => (
          <div className={clsx('pointer-events-auto', styles.btns)}>
            <div
              className={styles.btn}
              onClick={() => {
                close()
                router.push('/user/profile')
              }}>
              个人中心
            </div>
            <div
              className={styles.btn}
              onClick={() => {
                router.push('/login')
              }}>
              退出
            </div>
          </div>
        )}
      </PopoverPanel>
    </Popover>
  )
}
export default UserAvatar
