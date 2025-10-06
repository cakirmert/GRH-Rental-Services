"use client"

import { useCallback, useEffect, useRef } from "react"

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: {
          sitekey: string
          callback?: (token: string) => void
          "expired-callback"?: () => void
          "error-callback"?: () => void
          theme?: "light" | "dark" | "auto"
          appearance?: "always" | "execute" | "interaction-only"
        },
      ) => string
      reset: (widgetId?: string) => void
    }
  }
}

const SCRIPT_ID = "cf-turnstile-script"

type CloudflareTurnstileProps = {
  siteKey: string
  onToken: (token: string | null) => void
  className?: string
  theme?: "light" | "dark" | "auto"
}

export function CloudflareTurnstile({
  siteKey,
  onToken,
  className,
  theme = "auto",
}: CloudflareTurnstileProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const widgetIdRef = useRef<string | undefined>()

  const renderWidget = useCallback(() => {
    if (!window.turnstile || !containerRef.current) {
      return
    }

    containerRef.current.innerHTML = ""
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      theme,
      callback: (token: string) => {
        onToken(token)
      },
      "expired-callback": () => {
        onToken(null)
      },
      "error-callback": () => {
        onToken(null)
      },
    })
  }, [siteKey, onToken, theme])

  useEffect(() => {
    onToken(null)
  }, [onToken])

  useEffect(() => {
    if (!siteKey) {
      return
    }

    let isMounted = true
    const container = containerRef.current
    if (!container) {
      return () => {
        /* no-op */
      }
    }

    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null

    const handleLoad = () => {
      if (!isMounted) {
        return
      }
      renderWidget()
    }

    const handleError = () => {
      if (!isMounted) {
        return
      }
      onToken(null)
    }

    if (window.turnstile) {
      renderWidget()
    } else {
      if (!script) {
        script = document.createElement("script")
        script.id = SCRIPT_ID
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        script.async = true
        script.defer = true
        document.head.appendChild(script)
      }

      script.addEventListener("load", handleLoad)
      script.addEventListener("error", handleError)
    }

    return () => {
      isMounted = false
      script?.removeEventListener("load", handleLoad)
      script?.removeEventListener("error", handleError)

      if (window.turnstile && widgetIdRef.current) {
        window.turnstile.reset(widgetIdRef.current)
        widgetIdRef.current = undefined
      }

      container.innerHTML = ""
    }
  }, [siteKey, renderWidget, onToken])

  return <div ref={containerRef} className={className} />
}

export default CloudflareTurnstile
