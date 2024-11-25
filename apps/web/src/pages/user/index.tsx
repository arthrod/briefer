import { useRouter } from 'next/router'

export default function UserPage() {
  const router = useRouter()
  router.replace(`/user/profile`)
  return null
}
