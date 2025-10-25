import { useState, useEffect, useRef } from "react";
import { pusherClient } from "@/lib/pusher/client";

export function usePusherChannel(channelName: string | null) {
  const [channel, setChannel] = useState<any>(null);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!channelName) {
      setChannel(null);
      return;
    }

    const newChannel = pusherClient.subscribe(channelName);
    channelRef.current = newChannel;
    setChannel(newChannel);

    return () => {
      if (channelRef.current) {
        pusherClient.unsubscribe(channelName);
        channelRef.current = null;
        setChannel(null);
      }
    };
  }, [channelName]);

  return { channel };
}