
import { showToast, Toast } from "@/components/mf/Toast/index"
export type MFResponse<T> = {
    code: number,
    data: T,
    msg: string
}


export const getData = async <T> (res: Response): Promise<T> => {
    if (res.status === 401) {
        window.location.href = "/login";
    }
    if (!res) {
        return null as T;
    }
    const data = await res.json();
    if (data.code === 0) {
        return data.data as T;
    }
    showToast("错误", data.msg, 'error');
    throw new Error(JSON.stringify(data))
}