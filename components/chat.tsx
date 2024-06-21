'use client'

import { useChat, type Message } from 'ai/react'

import { cn, nanoid } from '@/lib/utils'
import { ChatList } from '@/components/chat-list'
import { ChatPanel } from '@/components/chat-panel'
import { EmptyScreen } from '@/components/empty-screen'
import { ChatScrollAnchor } from '@/components/chat-scroll-anchor'
import { useLocalStorage } from '@/lib/hooks/use-local-storage'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useEffect, useRef, useState } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { toast } from 'react-hot-toast'
import { usePathname, useRouter } from 'next/navigation'
import useChatStore from '@/store/useChatStore'
import { defaultModel, isLocalMode, useLangfuse } from '@/lib/const'
import { Chat as IChat } from '@/lib/types'
import { useSession } from 'next-auth/react'

const IS_PREVIEW = process.env.VERCEL_ENV === 'preview'
export interface ChatProps extends React.ComponentProps<'div'> {
  initialMessages: Message[]
  id?: string
  title?: string
  loading?: boolean
}

export function Chat({ id, initialMessages, className, title, loading }: ChatProps) {
  const router = useRouter()
  const path = usePathname()
  const [previewToken, setPreviewToken] = useLocalStorage<string | null>(
    'ai-token',
    null
  )
  const [previewTokenDialog, setPreviewTokenDialog] = useState(IS_PREVIEW)
  const [previewTokenInput, setPreviewTokenInput] = useState(previewToken ?? '')

  const { fetchHistory, chats, setChats } = useChatStore()
  const { data: session, status } = useSession()
  const latestTraceId = useRef<string | null>(null)

  const updatedMessages = useRef<Message[]>([]);
  const latestUserMessage = useRef<Message | null>(null);

  const { messages, setMessages, append, reload, stop, isLoading, input, setInput } =
    useChat({
      initialMessages,
      id,
      body: {
        id,
        previewToken,
        model: localStorage.getItem('selected-model')?.replaceAll('"', '') || defaultModel
      },
      sendExtraMessageFields: true,
      onResponse(response) {
        if (response.status === 401) {
          toast.error(response.statusText)
        }
        if (useLangfuse) {
          const newTraceId = response.headers.get("X-Trace-Id")
          latestTraceId.current = newTraceId
        }
      },
      onFinish(message: Message) {

        if (isLocalMode) {

          const existingChatIndex = chats.findIndex(chat => chat.chat_id === id)

          if (existingChatIndex !== -1) {
            const existingChat = chats[existingChatIndex]
            const newChat = { ...existingChat, messages: [message, ...existingChat.messages] }
            setChats([...chats.slice(0, existingChatIndex), newChat, ...chats.slice(existingChatIndex + 1)])
          } else {

            const newChat: IChat = {
              chat_id: id as string,
              title: input.substring(0, 100),
              created_at: new Date(),
              user_id: session?.user.id || '',
              path: `/chat/${id}`,
              messages: [...(initialMessages || []), { role: 'user', content: input, id: nanoid() }, message],
            }
            setChats([newChat, ...chats])
          }
        }
        
        if (latestUserMessage.current) {
          updatedMessages.current.push({
            ...latestUserMessage.current,
            id: latestUserMessage.current.id ?? nanoid(),
          })
          latestUserMessage.current = null
        }
        updatedMessages.current.push({
          ...message,
          id: latestTraceId.current ?? message.id,
        })
  
        setMessages([...(initialMessages || []), ...updatedMessages.current])

        if (!path.includes('chat')) {
          router.replace(`/chat/${id}`)
          // router.refresh()
          !isLocalMode && fetchHistory()
        }
      }
    })

  useEffect(() => {
    if (title) {
      document.title = title.toString().slice(0, 50)
    } else {
      document.title = 'New Chat - JoyChat'
    }
  }, [title])

  return (
    <>
      <div className={cn('md:pb-[200px] md:px-4 lg:px-0', className)}>
        { messages.filter(msg => msg.role !== 'system').length ? (
          <>
            <ChatList messages={messages} user={session?.user || {}} />
            <ChatScrollAnchor trackVisibility={isLoading} />
          </>
        ) : (
          <EmptyScreen setInput={setInput} />
        )}
      </div>
      <ChatPanel
        id={id}
        isLoading={isLoading}
        stop={stop}
        append={append}
        reload={reload}
        messages={messages}
        input={input}
        setInput={setInput}
        onSubmit={async (value) => {
          const userMessage: Message = {
            id: nanoid(),
            content: input,
            role: "user",
          }
          latestUserMessage.current = userMessage
          await append(userMessage)
        }}
      />

      <Dialog open={previewTokenDialog} onOpenChange={setPreviewTokenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter your OpenAI Key</DialogTitle>
            <DialogDescription>
              If you have not obtained your OpenAI API key, you can do so by{' '}
              <a
                href="https://platform.openai.com/signup/"
                className="underline"
              >
                signing up
              </a>{' '}
              on the OpenAI website. This is only necessary for preview
              environments so that the open source community can test the app.
              The token will be saved to your browser&apos;s local storage under
              the name <code className="font-mono">ai-token</code>.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={previewTokenInput}
            placeholder="OpenAI API key"
            onChange={e => setPreviewTokenInput(e.target.value)}
          />
          <DialogFooter className="items-center">
            <Button
              onClick={() => {
                setPreviewToken(previewTokenInput)
                setPreviewTokenDialog(false)
              }}
            >
              Save Token
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
