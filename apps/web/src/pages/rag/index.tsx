import { useRouter } from 'next/router'

export default function RagPage() {
  const router = useRouter()
  router.replace(`/home`)
  return null
}
