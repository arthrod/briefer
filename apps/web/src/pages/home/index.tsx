
import { useChats } from '@/hooks/useChats';
import React, { useCallback, useEffect } from 'react'

function Left() {

}


export default function Home() {
    const [{getChatList}] = useChats();
    useEffect(() => {  
        getChatList();
    },[]);
  return (
    <div>
      <h1>Home</h1>
    </div>
  )
}