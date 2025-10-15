"use client"

import { useState, KeyboardEvent } from "react"
import { useI18n } from "@/locales/i18n"
import { useView, View } from "@/contexts/ViewContext"
import { Container } from "@/components/ui/container"
import { Button } from "@/components/ui/button"

export default function FAQPage() {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const { t } = useI18n()
  const { setView } = useView()

  const toggleAnswer = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index)
  }

  const handleKeyToggle = (event: KeyboardEvent<HTMLDivElement>, index: number) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      toggleAnswer(index)
    }
  }

  const faqItems = [
    {
      key: "sign-up",
      question: t("faqPage.signUpQuestion"),
      answer: (
        <div className="mt-2 text-base space-y-2">
          <p>{t("faqPage.signUpAnswerPart1")}</p>
          <p>{t("faqPage.signUpAnswerPart2")}</p>
          <p>
            {t("faqPage.signUpAnswerPart3")}
            <Button
              variant="link"
              className="px-0"
              onClick={(event) => {
                event.stopPropagation()
                setView(View.CONTACT)
              }}
            >
              {t("footer.contactFormLink")}
            </Button>
            {t("faqPage.signUpAnswerPart4")}
          </p>
        </div>
      ),
    },
    {
      key: "booking-access",
      question: t("faqPage.bookingAccessQuestion"),
      answer: (
        <div className="mt-2 text-base space-y-2">
          <p>{t("faqPage.bookingAccessAnswerPart1")}</p>
          <p>{t("faqPage.bookingAccessAnswerPart2")}</p>
        </div>
      ),
    },
    {
      key: "book-room",
      question: t("faqPage.bookRoomQuestion"),
      answer: (
        <div className="mt-2 text-base space-y-2">
          <p>{t("faqPage.bookRoomAnswerPart1")}</p>
          <p>{t("faqPage.bookRoomAnswerPart2")}</p>
          <div
            className="text-base"
            dangerouslySetInnerHTML={{
              __html: t("faqPage.bookRoomAnswerPart3"),
            }}
          />
        </div>
      ),
    },
    {
      key: "cancel",
      question: t("faqPage.cancelQuestion"),
      answer: (
        <div className="mt-2 text-base space-y-2">
          <p>{t("faqPage.cancelAnswerPart1")}</p>
          <p>{t("faqPage.cancelAnswerPart2")}</p>
          <p>
            {t("faqPage.cancelAnswerPart3")} {" "}
            <Button
              variant="link"
              className="px-0"
              onClick={(event) => {
                event.stopPropagation()
                setView(View.CONTACT)
              }}
            >
              {t("footer.contactFormLink")}
            </Button>
            {" "}
            {t("faqPage.cancelAnswerPart4")}
          </p>
        </div>
      ),
    },
    {
      key: "support",
      question: t("faqPage.supportQuestion"),
      answer: (
        <p className="mt-2 text-base">
          {t("faqPage.supportAnswerPart1")}
          <Button
            variant="link"
            className="px-0"
            onClick={(event) => {
              event.stopPropagation()
              setView(View.CONTACT)
            }}
          >
            {t("footer.contactFormLink")}
          </Button>
          {t("faqPage.supportAnswerPart2")}
          <a href="mailto:rentals@grh-hamburg.de" className="underline">
            rentals@grh-hamburg.de
          </a>
          {t("faqPage.supportAnswerPart3")}
        </p>
      ),
    },
    {
      key: "profile-name",
      question: t("faqPage.profileNameQuestion"),
      answer: (
        <div className="mt-2 text-base space-y-2">
          <p>{t("faqPage.profileNameAnswerPart1")}</p>
          <p>{t("faqPage.profileNameAnswerPart2")}</p>
        </div>
      ),
    },
    {
      key: "other-rooms",
      question: t("faqPage.otherRoomsQuestion"),
      answer: (
        <p
          className="mt-2 text-base"
          dangerouslySetInnerHTML={{
            __html: t("faqPage.otherRoomsAnswer"),
          }}
        />
      ),
    },
    {
      key: "suggest-item",
      question: t("faqPage.suggestItemQuestion"),
      answer: (
        <div className="mt-2 text-base space-y-2">
          <p>
            {t("faqPage.suggestItemAnswerPart1")}
            <Button
              variant="link"
              className="px-0"
              onClick={(event) => {
                event.stopPropagation()
                setView(View.CONTACT)
              }}
            >
              {t("footer.contactFormLink")}
            </Button>
            {t("faqPage.suggestItemAnswerPart2")}
          </p>
          <p>{t("faqPage.suggestItemAnswerPart3")}</p>
        </div>
      ),
    },
  ]

  return (
    <Container className="max-w-3xl py-8 md:py-12">
      <h1 className="text-3xl font-bold mb-6 text-center">{t("faqPage.title")}</h1>

      <div className="space-y-4">
        {faqItems.map((item, index) => {
          const isExpanded = expandedIndex === index
          return (
            <div
              key={item.key}
              role="button"
              tabIndex={0}
              aria-expanded={isExpanded}
              className={`p-4 border rounded-lg cursor-pointer transition duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary bg-accent/80 hover:bg-accent ${
                isExpanded ? "bg-accent" : ""
              }`}
              onClick={() => toggleAnswer(index)}
              onKeyDown={(event) => handleKeyToggle(event, index)}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`transform transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  aria-hidden="true"
                >
                  ▼
                </span>
                <h2 className="font-semibold text-xl">{item.question}</h2>
              </div>
              {isExpanded && item.answer}
            </div>
          )
        })}
      </div>
    </Container>
  )
}
