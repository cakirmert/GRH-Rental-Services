"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { useI18n } from "@/locales/i18n"

interface BookingRulesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  isSubmitting: boolean
}

export function BookingRulesDialog({
  open,
  onOpenChange,
  onConfirm,
  isSubmitting,
}: BookingRulesDialogProps) {
  const [agreeToRules, setAgreeToRules] = useState(false)
  const { t } = useI18n()

  // Reset agreement when dialog closes
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setAgreeToRules(false)
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("bookingRulesDialog.title")}</DialogTitle>
          <DialogDescription>{t("bookingRulesDialog.description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4 text-foreground">
          <div className="space-y-2">
            <h3 className="font-medium">{t("bookingRulesDialog.generalRulesTitle")}</h3>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li>{t("bookingRulesDialog.ruleResponsible")}</li>
              <li>{t("bookingRulesDialog.ruleReturn")}</li>
              <li>{t("bookingRulesDialog.ruleReport")}</li>
              <li>{t("bookingRulesDialog.ruleClean")}</li>
              <li>{t("bookingRulesDialog.ruleRespect")}</li>
              <li>{t("bookingRulesDialog.ruleNoGuarantee")}</li>
            </ul>
          </div>
          <div className="space-y-2">
            <h3 className="font-medium">{t("bookingRulesDialog.cancellationPolicyTitle")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("bookingRulesDialog.cancellationPolicyDescription")}
            </p>
          </div>
          <div className="flex items-center space-x-2 pt-2">
            <Checkbox
              id="agree"
              checked={agreeToRules}
              onCheckedChange={(checked) => setAgreeToRules(checked === true)}
            />
            <label
              htmlFor="agree"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              {t("bookingRulesDialog.agreeToRules")}
            </label>
          </div>
        </div>
        <DialogFooter className="flex space-x-2 sm:justify-between">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
            {t("bookingRulesDialog.cancel")}
          </Button>
          <Button onClick={onConfirm} disabled={!agreeToRules || isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("bookingRulesDialog.submitting")}
              </>
            ) : (
              t("bookingRulesDialog.confirmBooking")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
