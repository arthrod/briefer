import ChatLayout from '@/components/mf/ChatLayout'
import styles from './index.module.scss'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { UserProfile, useUserProfile } from '@/hooks/mf/user/useUserProfile'

export default function UserProfilePage() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const getUserProfile = useUserProfile()

  useEffect(() => {
    getUserProfile().then((res) => {
      setUserProfile(res)
    })
  })

  return (
    <div className={styles.userProfile}>
      <div className={styles.title}>基本信息</div>
      <div className={clsx(styles.info, 'text-sm')}>
        <span className={styles.label}>用户名称</span>
        <span className={styles.value}>{userProfile ? userProfile.username : ''}</span>
      </div>
      <div className={clsx(styles.info, 'text-sm')}>
        <span className={styles.label}>角色</span>
        <span className={styles.value}>{userProfile ? userProfile.role : ''}</span>
      </div>
      <div className={clsx(styles.info, 'text-sm')}>
        <span className={styles.label}>昵称</span>
        <span className={styles.value}>{userProfile ? userProfile.nickname : ''}</span>
      </div>
      <div className={clsx(styles.info, 'text-sm')}>
        <span className={styles.label}>手机</span>
        <span className={styles.value}>{userProfile ? userProfile.phone : ''}</span>
      </div>
      <div className={clsx(styles.info, 'text-sm')}>
        <span className={styles.label}>邮箱</span>
        <span className={styles.value}>{userProfile ? userProfile.email : ''}</span>
      </div>
    </div>
  )
}
UserProfilePage.layout = ChatLayout
