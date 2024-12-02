import { useRouter } from 'next/router'

// props to chat gpt
function extractParamValue(pathname: string, path: string, paramName: string): string {
  const regexPattern = pathname.replace(/\[([^\]]+)\]/g, (_match, p1) =>
    p1 === paramName ? '([\\w-]+)' : '[^/]+'
  )

  const regex = new RegExp(regexPattern)

  const match = regex.exec(path)

  return match?.[1] ?? ''
}

export const useStringQuery = (name: string): string => {
  const router = useRouter()

  const pathname = router.pathname
  const path = typeof window === 'undefined' ? '' : window.location.pathname

  const arg = router.query[name] ?? extractParamValue(pathname, path, name)

  if (Array.isArray(arg)) {
    return arg[0]
  }

  return arg
}

export function getQueryParam(param: string) {
  const queryString = window.location.search.slice(1) // 获取 URL 中 `?` 后的部分，去掉 `?`
  const params = queryString.split('&') // 按 `&` 分割各个查询参数

  for (let i = 0; i < params.length; i++) {
    const [key, value] = params[i].split('=') // 分割每个查询参数的键和值
    if (key === param) {
      return decodeURIComponent(value) // 如果找到匹配的参数，返回解码后的值
    }
  }

  return ''
}
