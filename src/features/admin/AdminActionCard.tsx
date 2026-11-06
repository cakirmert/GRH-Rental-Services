"use client"

import React from "react"

export function AdminActionCard({
  title,
  description,
  icon,
  onClick,
  disabled,
  id,
}: {
  title: string
  description: string
  icon: React.ReactNode
  onClick: () => void
  disabled?: boolean
  id?: string
}) {
  const clsx = (...args: (string | boolean | undefined)[]): string => {
    return args
      .filter(Boolean)
      .filter((arg): arg is string => typeof arg === "string")
      .join(" ")
  }

  return (
    <button
      id={id}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "bg-card/50 glass border rounded-xl p-5 text-left hover:shadow-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-all duration-200 ease-in-out group",
        "flex flex-col items-start h-full",
        disabled && "opacity-50 cursor-not-allowed hover:shadow-none",
      )}
    >
      {icon}
      <h3 className="text-md font-semibold mb-1 group-hover:text-primary transition-colors">
        {title}
      </h3>
      <p className="text-xs text-muted-foreground flex-grow">
        {" "}
        {description}
      </p>
      {!disabled && (
        <span className="mt-3 text-xs text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity pt-1 self-end">
          {/* Using self-end to push to bottom right */}
          Go to section →
        </span>
      )}
    </button>
  )
}
