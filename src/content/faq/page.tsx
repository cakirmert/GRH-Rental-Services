"use client"

import { useState } from "react"
import { useI18n } from "@/locales/i18n"
import { useView, View } from "@/contexts/ViewContext"
import { Container } from "@/components/ui/container"

export default function FAQPage() {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const { t } = useI18n()
  const { setView } = useView()

  const toggleAnswer = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index)
  }

  return (
    <Container className="max-w-3xl py-8 md:py-12">
      <h1 className="text-3xl font-bold mb-6 text-center">{t("faqPage.title")}</h1>

      <div className="space-y-6">
        {/* FAQ Item 1 */}
        <div
          className="p-4 border rounded-lg hover:bg-accent transition duration-300"
          onClick={() => toggleAnswer(0)}
        >
          <div className="flex items-center gap-2 cursor-pointer">
            <span
              className={`transform transition-transform ${expandedIndex === 0 ? "rotate-180" : ""}`}
            >
              ▼
            </span>
            <h2 className="font-semibold text-xl">{t("faqPage.bookRoomQuestion")}</h2>
          </div>
          {expandedIndex === 0 && (
            <p className="mt-2 text-base">
              {t("faqPage.bookRoomAnswerPart1")} <br />
              {t("faqPage.bookRoomAnswerPart2")} <br />
              <br />
              <span
                dangerouslySetInnerHTML={{
                  __html: t("faqPage.bookRoomAnswerPart3"),
                }}
              />
            </p>
          )}
        </div>

        {/* FAQ Item 2 */}
        <div
          className="p-4 border rounded-lg hover:bg-accent transition duration-300"
          onClick={() => toggleAnswer(1)}
        >
          <div className="flex items-center gap-2 cursor-pointer">
            <span
              className={`transform transition-transform ${expandedIndex === 1 ? "rotate-180" : ""}`}
            >
              ▼
            </span>
            <h2 className="font-semibold text-xl">{t("faqPage.cancelQuestion")}</h2>
          </div>
          {expandedIndex === 1 && (
            <p className="mt-2 text-base">
              {t("faqPage.cancelAnswerPart1")} {t("faqPage.cancelAnswerPart2")}
              <button
                onClick={() => setView(View.CONTACT)}
                className="text-primary underline hover:text-primary/80"
              >
                {t("footer.contactFormLink")}
              </button>{" "}
              {t("faqPage.cancelAnswerPart3")}
            </p>
          )}
        </div>

        {/* FAQ Item 3 */}
        <div
          className="p-4 border rounded-lg hover:bg-accent transition duration-300"
          onClick={() => toggleAnswer(2)}
        >
          <div className="flex items-center gap-2 cursor-pointer">
            <span
              className={`transform transition-transform ${expandedIndex === 2 ? "rotate-180" : ""}`}
            >
              ▼
            </span>
            <h2 className="font-semibold text-xl">{t("faqPage.supportQuestion")}</h2>
          </div>
          {expandedIndex === 2 && (
            <p className="mt-2 text-base">
              {t("faqPage.supportAnswerPart1")}
              <button
                onClick={() => setView(View.CONTACT)}
                className="text-primary underline hover:text-primary/80"
              >
                {t("footer.contactFormLink")}
              </button>
              {t("faqPage.supportAnswerPart2")}
              <a href="mailto:rentals@grh-hamburg.de" className="underline">
                rentals@grh-hamburg.de
              </a>
              {t("faqPage.supportAnswerPart3")}
            </p>
          )}
        </div>

        {/* FAQ Item 4 */}
        <div
          className="p-4 border rounded-lg hover:bg-accent transition duration-300"
          onClick={() => toggleAnswer(3)}
        >
          <div className="flex items-center gap-2 cursor-pointer">
            <span
              className={`transform transition-transform ${expandedIndex === 3 ? "rotate-180" : ""}`}
            >
              ▼
            </span>
            <h2 className="font-semibold text-xl">{t("faqPage.otherRoomsQuestion")}</h2>
          </div>
          {expandedIndex === 3 && (
            <p
              className="mt-2 text-base"
              dangerouslySetInnerHTML={{
                __html: t("faqPage.otherRoomsAnswer"),
              }}
            />
          )}
        </div>

        {/* FAQ Item 4 */}
        <div
          className="p-4 border rounded-lg hover:bg-accent transition duration-300"
          onClick={() => toggleAnswer(4)}
        >
          <div className="flex items-center gap-2 cursor-pointer">
            <span
              className={`transform transition-transform ${expandedIndex === 4 ? "rotate-180" : ""}`}
            >
              ▼
            </span>
            <h2 className="font-semibold text-xl">{t("faqPage.suggestItemQuestion")}</h2>
          </div>
          {expandedIndex === 4 && (
            <p className="mt-2 text-base">
              {t("faqPage.suggestItemAnswerPart1")}
              <button
                onClick={() => setView(View.CONTACT)}
                className="text-primary underline hover:text-primary/80"
              >
                {t("footer.contactFormLink")}
              </button>
              {t("faqPage.suggestItemAnswerPart2")}
              <br />
              {t("faqPage.suggestItemAnswerPart3")}
            </p>
          )}
        </div>
      </div>
    </Container>
  )
}
