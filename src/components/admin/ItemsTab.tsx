// src/components/admin/ItemsTab.tsx
"use client"

import React, { useState, useMemo } from "react"
import clsx from "clsx"
import Image from "next/image"
import { ItemType } from "@prisma/client"
import { trpc } from "@/utils/trpc"
import { useI18n } from "@/locales/i18n"
import { getOptimizedImageUrl } from "@/lib/imageUtils"

import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@/server/routers/appRouter"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card"
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/use-toast"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import ItemImagesField from "@/components/ItemImagesField"
import {
  Search,
  Pencil,
  Loader2,
  PlusCircle,
  Image as ImageIcon,
  BookOpenText,
  Users,
  Info,
  AlertTriangle,
  Save,
  ArrowLeft,
} from "lucide-react"

type RouterOutput = inferRouterOutputs<AppRouter>
type RouterInput = inferRouterInputs<AppRouter>
type ItemFullData = RouterInput["admin"]["items"]["create"]
type ItemInList = RouterOutput["admin"]["items"]["list"][number]

const defaultItemFormData: ItemFullData = {
  titleEn: "",
  titleDe: "",
  descriptionEn: "",
  descriptionDe: "",
  rulesEn: "",
  rulesDe: "",
  type: ItemType.SPORTS,
  capacity: undefined,
  players: "",
  totalQuantity: 1,
  images: [],
  active: true,
}

const useItemTypeLabels = () => {
  const { t } = useI18n()
  return (type: ItemType | undefined | null): string => {
    if (!type) return ""
    switch (type) {
      case ItemType.ROOM:
        return t("common.room")
      case ItemType.SPORTS:
        return t("common.sports")
      case ItemType.GAME:
        return t("common.game")
      case ItemType.OTHER:
        return t("common.other")
      default:
        return type
    }
  }
}

export default function ItemsTab() {
  const { t, locale } = useI18n()
  const utils = trpc.useContext()
  const getItemTypeLabel = useItemTypeLabels()

  const {
    data: items = [],
    isLoading: isLoadingItemsFallback,
    error: itemsError,
  } = trpc.admin.items.list.useQuery(undefined, { initialData: [] })
  const isLoadingItems = isLoadingItemsFallback && items.length === 0
  const toggleActiveMutation = trpc.admin.items.toggle.useMutation({
    onSuccess: () => {
      utils.admin.items.list.invalidate()
      toast({ title: t("common.statusChanged") })
    },
    onError: (error) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" })
    },
  })
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<"ALL" | ItemType>("ALL")
  const filteredItems = useMemo(
    () =>
      items.filter(
        (it) =>
          (locale === "de" && it.titleDe ? it.titleDe : it.titleEn)
            .toLowerCase()
            .includes(search.toLowerCase()) &&
          (typeFilter === "ALL" || it.type === typeFilter),
      ),
    [items, search, typeFilter, locale],
  )

  const [viewMode, setViewMode] = useState<"list" | "form">("list")
  const [formMode, setFormMode] = useState<"create" | "edit">("create")
  const [currentItemId, setCurrentItemId] = useState<string | null>(null)
  const [formData, setFormData] = useState<ItemFullData>(defaultItemFormData)
  const [itemImages, setItemImages] = useState<string[]>([])

  const handleFormInputChange = <K extends keyof ItemFullData>(field: K, value: ItemFullData[K]) =>
    setFormData((prev) => ({ ...prev, [field]: value }))

  const handleFormNumberInputChange = (field: keyof ItemFullData, value: string) => {
    const num = parseInt(value, 10)
    setFormData((prev: ItemFullData) => ({ ...prev, [field]: isNaN(num) ? undefined : num }))
  }
  const openCreateForm = () => {
    setFormMode("create")
    setCurrentItemId(null)
    setFormData(defaultItemFormData)
    setItemImages([])
    setViewMode("form")
  }

  const openEditForm = (item: ItemInList) => {
    setFormMode("edit")
    setCurrentItemId(item.id)
    let parsedImages: string[] = []
    try {
      const parsed = item.imagesJson ? JSON.parse(item.imagesJson) : []
      parsedImages = Array.isArray(parsed) ? parsed.map(String) : []
      setItemImages(parsedImages)
    } catch {
      setItemImages([])
    }
    setFormData({
      titleEn: item.titleEn,
      titleDe: item.titleDe ?? "",
      descriptionEn: item.descriptionEn ?? "",
      descriptionDe: item.descriptionDe ?? "",
      rulesEn: item.rulesEn ?? "",
      rulesDe: item.rulesDe ?? "",
      type: item.type,
      capacity: item.capacity ?? undefined,
      players: item.players ?? "",
      totalQuantity: item.totalQuantity,
      images: parsedImages,
      active: item.active,
    })
    setViewMode("form")
  }

  const createItemMutation = trpc.admin.items.create.useMutation({
    onSuccess: () => {
      utils.admin.items.list.invalidate()
      toast({ title: t("adminDashboard.items.itemCreatedSuccess") })
      setViewMode("list")
      setItemImages([])
    },
    onError: (error) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" })
    },
  })

  const updateItemMutation = trpc.admin.items.update.useMutation({
    onSuccess: () => {
      utils.admin.items.list.invalidate()
      toast({ title: t("adminDashboard.items.itemUpdatedSuccess") })
      setViewMode("list")
    },
    onError: (error) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" })
    },
  })

  const handleSubmitForm = () => {
    if (!formData.titleEn.trim()) {
      toast({
        title: t("common.error"),
        description: t("errors.fieldRequired", {
          fieldName: t("adminDashboard.items.form.titleEn"),
        }),
        variant: "destructive",
      })
      return
    }
    if (formData.totalQuantity < 1) {
      toast({
        title: t("common.error"),
        description: t("errors.minValue", {
          fieldName: t("adminDashboard.items.form.qty"),
          value: 1,
        }),
        variant: "destructive",
      })
      return
    }

    const dataToSubmit: Omit<ItemFullData, "id"> & { id?: string } = {
      titleEn: formData.titleEn.trim(),
      titleDe: formData.titleDe?.trim() || undefined,
      descriptionEn: formData.descriptionEn?.trim() || undefined,
      descriptionDe: formData.descriptionDe?.trim() || undefined,
      rulesEn: formData.rulesEn?.trim() || undefined,
      rulesDe: formData.rulesDe?.trim() || undefined,
      type: formData.type,
      capacity:
        formData.capacity === undefined || isNaN(Number(formData.capacity))
          ? undefined
          : Number(formData.capacity),
      players: formData.players?.trim() || undefined,
      totalQuantity: Number(formData.totalQuantity) || 1,
      images: itemImages,
      active: formData.active,
    }

    if (formMode === "create") {
      createItemMutation.mutate(dataToSubmit as ItemFullData)
    } else if (currentItemId) {
      const updatePayload = { id: currentItemId, ...dataToSubmit }
      updateItemMutation.mutate(updatePayload)
    }
  }
  const isMutatingAnyForm = createItemMutation.isPending || updateItemMutation.isPending

  if (isLoadingItems) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">{t("common.loading")}...</p>
      </div>
    )
  }
  if (itemsError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-destructive">
        <AlertTriangle className="h-8 w-8" />
        <p>{t("errors.fetchItems")}</p>
        <p className="text-sm text-muted-foreground">{itemsError.message}</p>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center p-2 gap-2 mb-4">
        {viewMode === "list" ? (
          <>
            <div className="relative flex-grow sm:max-w-xs w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-10 text-sm h-9"
                aria-label={t("adminDashboard.items.searchPlaceholder")}
                placeholder={t("adminDashboard.items.searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as "ALL" | ItemType)}>
              <SelectTrigger className="w-full sm:w-auto min-w-[160px] text-sm h-9">
                <SelectValue placeholder={t("common.typeFilterPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL" className="text-sm">
                  {t("common.all")}
                </SelectItem>
                {Object.values(ItemType).map((typeValue) => (
                  <SelectItem key={typeValue} value={typeValue} className="text-sm">
                    {getItemTypeLabel(typeValue)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={openCreateForm} className="w-full sm:w-auto text-sm h-9">
              <PlusCircle className="h-4 w-4 mr-2" />
              {t("adminDashboard.items.new")}
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={() => setViewMode("list")} className="text-sm h-9 w-fit">
            <ArrowLeft className="mr-2 h-4 w-4" /> {t("common.back")}
          </Button>
        )}
      </div>

      {viewMode === "list" && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px] hidden md:table-cell pl-4 pr-2 py-3">
                    {t("adminDashboard.items.table.image")}
                  </TableHead>
                  <TableHead className="px-4 py-3">
                    {t("adminDashboard.items.table.title")}
                  </TableHead>
                  <TableHead className="hidden sm:table-cell px-4 py-3">
                    {t("common.type")}
                  </TableHead>
                  <TableHead className="text-right hidden lg:table-cell px-4 py-3">
                    {t("adminDashboard.items.table.qty")}
                  </TableHead>
                  <TableHead className="px-4 py-3">
                    {t("adminDashboard.items.table.active")}
                  </TableHead>
                  <TableHead className="text-right pr-4 pl-2 py-3">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-40 text-center text-muted-foreground">
                      <div className="flex flex-col items-center gap-3">
                        <Info className="w-12 h-12 text-muted-foreground/30" />
                        <span>
                          {search || typeFilter !== "ALL"
                            ? t("adminDashboard.items.noItemsMatchFilter")
                            : t("adminDashboard.items.noItemsCreatedYet")}
                        </span>
                        {!(search || typeFilter !== "ALL") && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={openCreateForm}
                            className="mt-2 text-sm h-9"
                          >
                            <PlusCircle className="h-4 w-4 mr-2" />
                            {t("adminDashboard.items.createFirstItem")}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredItems.map((item) => (
                    <TableRow
                      key={item.id}
                      className={clsx(
                        "text-sm",
                        !item.active && "opacity-50 hover:opacity-80 transition-opacity",
                      )}
                    >
                      <TableCell className="hidden md:table-cell pl-4 pr-2 py-2.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            {(() => {
                              try {
                                const images = item.imagesJson ? JSON.parse(item.imagesJson) : []
                                const firstImage =
                                  Array.isArray(images) && images.length > 0
                                    ? getOptimizedImageUrl(images[0])
                                    : null
                                return firstImage ? (
                                  <Image
                                    src={firstImage}
                                    alt={
                                      locale === "de" && item.titleDe ? item.titleDe : item.titleEn
                                    }
                                    width={40}
                                    height={40}
                                    className="h-10 w-10 object-cover rounded-md border"
                                  />
                                ) : (
                                  <div className="h-10 w-10 bg-muted rounded-md flex items-center justify-center text-muted-foreground border">
                                    <ImageIcon size={20} />
                                  </div>
                                )
                              } catch {
                                return (
                                  <div className="h-10 w-10 bg-muted rounded-md flex items-center justify-center text-muted-foreground border">
                                    <ImageIcon size={20} />
                                  </div>
                                )
                              }
                            })()}
                          </TooltipTrigger>
                          {(() => {
                            try {
                              const images = item.imagesJson ? JSON.parse(item.imagesJson) : []
                              const firstImage =
                                Array.isArray(images) && images.length > 0
                                  ? getOptimizedImageUrl(images[0])
                                  : null
                              return firstImage ? (
                                <TooltipContent>
                                  <Image
                                    src={firstImage}
                                    alt={
                                      locale === "de" && item.titleDe ? item.titleDe : item.titleEn
                                    }
                                    width={160}
                                    height={160}
                                    className="h-40 w-40 object-contain rounded"
                                  />
                                </TooltipContent>
                              ) : null
                            } catch {
                              return null
                            }
                          })()}
                        </Tooltip>
                      </TableCell>
                      <TableCell className="font-medium max-w-[150px] sm:max-w-[280px] truncate px-4 py-2.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-left block">
                              {locale === "de" && item.titleDe ? item.titleDe : item.titleEn}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {locale === "de" && item.titleDe ? item.titleDe : item.titleEn}
                          </TooltipContent>
                        </Tooltip>
                        {locale === "de" && item.titleDe
                          ? item.titleEn && (
                              <span className="block text-xs text-muted-foreground truncate font-normal">
                                {item.titleEn}
                              </span>
                            )
                          : item.titleDe && (
                              <span className="block text-xs text-muted-foreground truncate font-normal">
                                {item.titleDe}
                              </span>
                            )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell px-4 py-2.5">
                        {getItemTypeLabel(item.type)}
                      </TableCell>
                      <TableCell className="text-right hidden lg:table-cell px-4 py-2.5">
                        {item.totalQuantity}
                      </TableCell>
                      <TableCell className="px-4 py-2.5">
                        <Switch
                          checked={item.active}
                          onCheckedChange={(v) =>
                            toggleActiveMutation.mutate({ itemId: item.id, isEnabled: v })
                          }
                          disabled={
                            toggleActiveMutation.isPending &&
                            toggleActiveMutation.variables?.itemId === item.id
                          }
                          aria-label={
                            item.active ? `Deactivate ${item.titleEn}` : `Activate ${item.titleEn}`
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right space-x-1 pr-4 pl-2 py-2.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => openEditForm(item)}
                              className="h-8 w-8 text-muted-foreground hover:text-primary"
                            >
                              <Pencil className="h-4 w-4" />
                              <span className="sr-only">
                                {t("common.edit")} {item.titleEn}
                              </span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="left">{t("common.edit")}</TooltipContent>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {viewMode === "form" && (
        <div className="mt-4">
          <Card className="max-w-2xl mx-auto">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl">
                {formMode === "create"
                  ? t("adminDashboard.items.newTitle")
                  : t("adminDashboard.items.editTitle")}
              </CardTitle>
              <CardDescription>
                {formMode === "create"
                  ? t("adminDashboard.items.createItemDescription")
                  : t("adminDashboard.items.editItemDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5 p-4 pt-0">
                <Field
                  icon={<Info size={16} />}
                  label={t("adminDashboard.items.form.titleEn")}
                  value={formData.titleEn}
                  onChange={(v) => handleFormInputChange("titleEn", v)}
                  required
                  disabled={isMutatingAnyForm}
                />
                <Field
                  icon={<Info size={16} />}
                  label={t("adminDashboard.items.form.titleDe")}
                  value={formData.titleDe ?? ""}
                  onChange={(v) => handleFormInputChange("titleDe", v)}
                  disabled={isMutatingAnyForm}
                />

                <div className="sm:col-span-2">
                  <Label className="mb-1.5 flex items-center text-sm">
                    <Info size={16} className="mr-1.5 text-muted-foreground" />
                    {t("adminDashboard.items.form.descriptionEn")}
                  </Label>
                  <Textarea
                    rows={3}
                    value={formData.descriptionEn ?? ""}
                    onChange={(e) => handleFormInputChange("descriptionEn", e.target.value)}
                    disabled={isMutatingAnyForm}
                    className="text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label className="mb-1.5 flex items-center text-sm">
                    <Info size={16} className="mr-1.5 text-muted-foreground" />
                    {t("adminDashboard.items.form.descriptionDe")}
                  </Label>
                  <Textarea
                    rows={3}
                    value={formData.descriptionDe ?? ""}
                    onChange={(e) => handleFormInputChange("descriptionDe", e.target.value)}
                    disabled={isMutatingAnyForm}
                    className="text-sm"
                  />
                </div>

                <div className="sm:col-span-2">
                  <Label className="mb-1.5 flex items-center text-sm">
                    <BookOpenText size={16} className="mr-1.5 text-muted-foreground" />
                    {t("adminDashboard.items.form.rulesEn")}
                  </Label>
                  <Textarea
                    rows={3}
                    value={formData.rulesEn ?? ""}
                    onChange={(e) => handleFormInputChange("rulesEn", e.target.value)}
                    disabled={isMutatingAnyForm}
                    className="text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label className="mb-1.5 flex items-center text-sm">
                    <BookOpenText size={16} className="mr-1.5 text-muted-foreground" />
                    {t("adminDashboard.items.form.rulesDe")}
                  </Label>
                  <Textarea
                    rows={3}
                    value={formData.rulesDe ?? ""}
                    onChange={(e) => handleFormInputChange("rulesDe", e.target.value)}
                    disabled={isMutatingAnyForm}
                    className="text-sm"
                  />
                </div>

                <div className="sm:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="mb-1.5 flex items-center text-sm">
                      {t("common.type")}
                      <span className="text-destructive ml-1">*</span>
                    </Label>
                    <Select
                      value={formData.type}
                      onValueChange={(v) => handleFormInputChange("type", v as ItemType)}
                      disabled={isMutatingAnyForm}
                    >
                      <SelectTrigger className="text-sm h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(ItemType).map((typeValue) => (
                          <SelectItem key={typeValue} value={typeValue} className="text-sm">
                            {getItemTypeLabel(typeValue)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <FieldNumber
                    icon={<Users size={16} />}
                    label={t("adminDashboard.items.form.qty")}
                    value={(formData.totalQuantity ?? 1).toString()}
                    onChange={(v) => handleFormInputChange("totalQuantity", Number(v))}
                    min={1}
                    required
                    disabled={isMutatingAnyForm}
                  />
                  <FieldNumber
                    icon={<Users size={16} />}
                    label={t("adminDashboard.items.form.capacity")}
                    value={(formData.capacity ?? "").toString()}
                    onChange={(v) => handleFormNumberInputChange("capacity", v)}
                    min={0}
                    placeholder={t("common.optional")}
                    disabled={isMutatingAnyForm}
                  />
                  <Field
                    icon={<Users size={16} />}
                    label={t("adminDashboard.items.form.players")}
                    value={formData.players ?? ""}
                    onChange={(v) => handleFormInputChange("players", v)}
                    placeholder={t("common.optional") + " (e.g. 2-4)"}
                    disabled={isMutatingAnyForm}
                  />
                </div>
                <div className="sm:col-span-2">
                  <ItemImagesField
                    initialImages={itemImages}
                    itemId={currentItemId ?? undefined}
                    onChange={setItemImages}
                  />
                </div>

                <div className="flex items-center gap-2 sm:col-span-2 pt-2">
                  <Switch
                    id="item-form-active"
                    checked={formData.active}
                    onCheckedChange={(v) => handleFormInputChange("active", v)}
                    disabled={isMutatingAnyForm}
                  />
                  <Label htmlFor="item-form-active" className="text-sm">
                    {t("adminDashboard.items.form.active")}
                  </Label>{" "}
                </div>
              </div>
            </CardContent>
            <CardFooter className="border-t pt-4 gap-2">
              <Button
                variant="outline"
                onClick={() => setViewMode("list")}
                disabled={isMutatingAnyForm}
                className="text-sm h-9"
              >
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleSubmitForm}
                disabled={isMutatingAnyForm}
                className="text-sm h-9"
              >
                {createItemMutation.isPending || updateItemMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : formMode === "create" ? (
                  <PlusCircle className="h-4 w-4 mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {formMode === "create"
                  ? t("adminDashboard.items.createButton")
                  : t("common.saveChanges")}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
  icon,
  disabled,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  required?: boolean
  icon?: React.ReactNode
  disabled?: boolean
}) {
  const id = React.useId()
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-center text-sm font-medium">
        {icon && <span className="mr-1.5 text-muted-foreground">{icon}</span>}
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className="text-sm h-9"
      />
    </div>
  )
}

function FieldNumber({
  label,
  value,
  onChange,
  placeholder,
  min,
  required,
  icon,
  disabled,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  min?: number
  required?: boolean
  icon?: React.ReactNode
  disabled?: boolean
}) {
  const id = React.useId()
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-center text-sm font-medium">
        {icon && <span className="mr-1.5 text-muted-foreground">{icon}</span>}
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <Input
        id={id}
        type="number"
        min={min}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className="text-sm h-9"
      />
    </div>
  )
}
