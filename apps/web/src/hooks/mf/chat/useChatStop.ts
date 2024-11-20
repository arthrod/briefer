import { NEXT_PUBLIC_MF_API_URL } from "@/utils/env"
import { useCallback, useMemo } from "react"
import { getData } from "../useResponse"

export const useChatStop = () => {
    const stopChat = useCallback(async (roundId: string): Promise<null> => {
        const res = await fetch(`${NEXT_PUBLIC_MF_API_URL()}/chat/stop`, {
            credentials: 'include',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                roundId: roundId,
            }),
        })
        // if (res.status > 299) {
        //   throw new Error(`Unexpected status ${res.status}`)
        // }

        return getData<null>(res)
    }, [])
    return useMemo(() => [{ stopChat }], [stopChat])
}