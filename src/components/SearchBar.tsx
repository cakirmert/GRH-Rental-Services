"use client"
// src/components/SearchBar.tsx

import { Search, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/locales/i18n"
import { memo, useCallback } from "react"

interface SearchBarProps {
  searchTerm: string
  setSearchTerm: (term: string) => void
  activeTab: "room" | "sports" | "game" | "other"
  setActiveTab: (tab: "room" | "sports" | "game" | "other") => void
}

export const SearchBar = memo(function SearchBar({
  searchTerm,
  setSearchTerm,
  activeTab,
  setActiveTab,
}: SearchBarProps) {
  const { t } = useI18n()

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchTerm(e.target.value)
    },
    [setSearchTerm],
  )
  const handleTabChange = useCallback(
    (value: string) => {
      setActiveTab(value as "room" | "sports" | "game" | "other")
    },
    [setActiveTab],
  )

  const clearSearch = useCallback(() => {
    setSearchTerm("")
  }, [setSearchTerm])
  return (
    <div className="mb-8 flex flex-col md:flex-row gap-4">
      <div className="relative flex-grow">
        <Input
          type="text"
          placeholder={t("search.placeholder")}
          aria-label={t("search.placeholder")}
          value={searchTerm}
          onChange={handleSearchChange}
          className="pl-10 pr-10 h-12"
        />
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
        {searchTerm && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearSearch}
            aria-label={t("common.clearSearch")}
            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0 hover:bg-muted-foreground/10"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full md:w-fit">
        <TabsList className="grid w-full grid-cols-4 p-2 h-12">
          <TabsTrigger value="room">{t("search.tabs.room")}</TabsTrigger>
          <TabsTrigger value="sports">{t("search.tabs.sports")}</TabsTrigger>
          <TabsTrigger value="game">{t("search.tabs.game")}</TabsTrigger>
          <TabsTrigger value="other">{t("search.tabs.other")}</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  )
})
