import { showToast, Toast } from '@/components/mf/Toast/index'
export type MFResponse<T> = {
  code: number
  data: T
  msg: string
}

export const getData = async <T>(res: Response): Promise<T> => {
  if (res.status === 401) {
    window.location.href = '/login'
  }
  if (!res) {
    return null as T
  }

  if (res.status === 500) {
    showToast('服务异常请联系管理人员', 'error')
    return Promise.reject({ code: 10000, data: {}, msg: '服务异常请联系管理人员' })
  }
  const data = await res.json()

  if (data.code === 0) {
    return data.data as T
  }
  showToast(data.msg, 'error')
  return Promise.reject(data)
}
