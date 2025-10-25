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

    console.log("Subscribing to Pusher channel:", channelName);

    const newChannel = pusherClient.subscribe(channelName);

    newChannel.bind("pusher:subscription_succeeded", () => {
      console.log("Successfully subscribed to channel:", channelName);
    });

    newChannel.bind("pusher:subscription_error", (error: any) => {
      console.error("Failed to subscribe to channel:", channelName, error);
    });

    channelRef.current = newChannel;
    setChannel(newChannel);

    return () => {
      if (channelRef.current) {
        console.log("Unsubscribing from channel:", channelName);
        pusherClient.unsubscribe(channelName);
        channelRef.current = null;
        setChannel(null);
      }
    };
  }, [channelName]);

  return { channel };
}
