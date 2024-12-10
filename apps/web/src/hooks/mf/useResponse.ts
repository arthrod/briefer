import { showToast, Toast } from '@/components/mf/Toast/index'
export type MFResponse<T> = {
  code: number
  data: T
  msg: string
}

export const getData = async <T>(res: Response, showError: boolean = true): Promise<T> => {
  if (res.status === 401) {
    window.location.href = '/login'
  }
  if (!res) {
    return {} as T
  }

  if (res.status === 500) {
    showError ? showToast('服务异常请联系管理人员', 'error') : ''
    return Promise.reject({ code: 10000, data: {}, msg: '服务异常请联系管理人员' })
  }
  const data = await res.json()

  if (data.code === 0) {
    return data.data as T
  }
  showError ? showToast(data.msg, 'error') : ''
  return Promise.reject(data)
}
