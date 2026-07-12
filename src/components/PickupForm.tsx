"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { IOrderItem } from "@/models/Customer";
import { IPickupItem } from "@/models/PickupEvent";
import { confirmPickup } from "@/app/actions/confirmPickup";
import { searchProductsAction } from "@/app/actions/shopifyActions";

type ItemState = {
  productName: string;
  unitNumber: number;
  totalUnits: number;
  status: "picked" | "skipped" | "swapped";
  replacement: string;
  imageUrl?: string;
};

export default function PickupForm({
  customerId,
  customerEmail,
  remainingItems,
}: {
  customerId: string;
  customerEmail: string;
  remainingItems: IOrderItem[];
}) {
  const [items, setItems] = useState<ItemState[]>(
    remainingItems.flatMap((i) =>
      Array.from({ length: i.qty }, (_, unit) => ({
        productName: i.productName,
        unitNumber: unit + 1,
        totalUnits: i.qty,
        status: "picked" as const,
        replacement: "",
        imageUrl: i.imageUrl,
      })),
    ),
  );
  const [notes, setNotes] = useState("");
  const [testMode, setTestMode] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [swapError, setSwapError] = useState<number | null>(null);
  const [searchResults, setSearchResults] = useState<Record<number, string[]>>(
    {},
  );
  const [searchOpen, setSearchOpen] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function setStatus(idx: number, status: "picked" | "skipped" | "swapped") {
    setItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, status } : item)),
    );
    if (status !== "swapped") {
      setSearchResults((prev) => {
        const n = { ...prev };
        delete n[idx];
        return n;
      });
      setSearchOpen(null);
    }
    if (swapError === idx) setSwapError(null);
  }

  function setReplacement(idx: number, value: string) {
    setItems((prev) =>
      prev.map((item, i) =>
        i === idx ? { ...item, replacement: value } : item,
      ),
    );
    if (swapError === idx) setSwapError(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setSearchResults((prev) => ({ ...prev, [idx]: [] }));
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const results = await searchProductsAction(value);
      console.log("search results", results);
      setSearchResults((prev) => ({ ...prev, [idx]: results }));
      setSearchOpen(idx);
    }, 300);
  }

  function pickSuggestion(idx: number, title: string) {
    setItems((prev) =>
      prev.map((item, i) =>
        i === idx ? { ...item, replacement: title } : item,
      ),
    );
    setSearchResults((prev) => ({ ...prev, [idx]: [] }));
    setSearchOpen(null);
  }

  async function handleSubmit() {
    const missingIdx = items.findIndex(
      (i) => i.status === "swapped" && !i.replacement.trim(),
    );
    if (missingIdx !== -1) {
      setSwapError(missingIdx);
      return;
    }
    setSwapError(null);
    setSubmitting(true);
    try {
      const payload: IPickupItem[] = items.map((i) => ({
        productName: i.productName,
        qty: 1,
        status: i.status,
        replacement:
          i.status === "swapped" ? { name: i.replacement.trim() } : null,
        imageUrl: i.imageUrl,
      }));
      const result = await confirmPickup({
        customerId,
        notes,
        items: payload,
        testEmail: testMode ? testEmail : undefined,
      });
      setEmailSent(result.emailSent);
      setDone(true);
    } catch (err) {
      console.error("Pickup failed:", err);
      alert("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="text-center py-12">
        <p className="text-4xl mb-3">✓</p>
        <p className="text-lg font-semibold">Pickup confirmed!</p>
        <p className="text-sm text-gray-500 mb-6">
          {emailSent
            ? `Email sent to ${customerEmail}`
            : "Pickup saved (email not sent)"}
        </p>
        <Link href="/" className="text-blue-600 text-sm">
          ← Back to list
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item, idx) => (
        <div
          key={`${item.productName}-${item.unitNumber}`}
          className={`border rounded-xl p-4 transition-opacity ${item.status === "skipped" ? "opacity-40" : ""}`}
        >
          <div className="flex justify-between items-start gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{item.productName}</p>
              {item.totalUnits > 1 && (
                <p className="text-xs text-gray-400">
                  Unit {item.unitNumber} of {item.totalUnits}
                </p>
              )}
            </div>
            <div className="flex gap-1 shrink-0">
              {(["picked", "skipped", "swapped"] as const).map((s) => (
                <button
                  key={s}
                  aria-pressed={item.status === s}
                  onClick={() => setStatus(idx, s)}
                  className={`text-xs px-3 py-2 min-h-[36px] rounded-full border capitalize transition-colors ${
                    item.status === s
                      ? s === "skipped"
                        ? "bg-gray-100 text-gray-500 border-gray-300"
                        : "bg-gray-400 text-white border-gray-400"
                      : "bg-white text-gray-400 border-gray-200"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {item.status === "swapped" && (
            <div className="mt-2 relative">
              <input
                type="text"
                placeholder="Search replacement product…"
                value={item.replacement}
                onChange={(e) => setReplacement(idx, e.target.value)}
                onFocus={() => searchResults[idx]?.length && setSearchOpen(idx)}
                onBlur={() => setTimeout(() => setSearchOpen(null), 150)}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 ${swapError === idx ? "border-red-400" : ""}`}
              />
              {swapError === idx && (
                <p className="mt-1 text-xs text-red-500">
                  Enter a replacement product name.
                </p>
              )}
              {searchOpen === idx && searchResults[idx]?.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg text-sm overflow-hidden">
                  {searchResults[idx].map((title) => (
                    <li key={title}>
                      <button
                        type="button"
                        onMouseDown={() => pickSuggestion(idx, title)}
                        className="w-full text-left px-3 py-2 hover:bg-yellow-50 transition-colors"
                      >
                        {title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      ))}

      <textarea
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="w-full border rounded-xl p-3 text-sm resize-none"
        rows={3}
      />

      {/* Test mode */}
      <div className="border rounded-xl p-3 bg-gray-50 space-y-2">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={testMode}
            onChange={(e) => setTestMode(e.target.checked)}
            className="w-4 h-4"
          />
          <span className="text-sm text-gray-600">Send test email instead</span>
        </label>
        {testMode && (
          <input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="test@example.com"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
          />
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold disabled:opacity-50"
      >
        {submitting ? "Confirming…" : "Confirm pickup"}
      </button>
    </div>
  );
}
