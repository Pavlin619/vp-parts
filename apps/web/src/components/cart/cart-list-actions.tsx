"use client";

import Link from "next/link";
import { ArrowLeft, ShoppingCart } from "lucide-react";
import { plural } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface CartListActionsProps {
  onClear: () => void;
  itemCount: number;
}

/** The two ways out of the list: back to browsing, or start over. */
export function CartListActions({ onClear, itemCount }: CartListActionsProps) {
  return (
    <div className="flex items-center justify-between gap-4 px-1 pt-3.5">
      <Link
        href="/catalog"
        className="inline-flex items-center gap-1.5 text-[13px] text-ink-3 transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Продължи пазаруването
      </Link>

      <ClearCartDialog onConfirm={onClear} itemCount={itemCount} />
    </div>
  );
}

/**
 * The ask in front of emptying the cart. The lines live only in this browser,
 * so there is nothing to restore them from — a misclick here is the one action
 * on this page that cannot be undone.
 */
function ClearCartDialog({
  onConfirm,
  itemCount,
}: {
  onConfirm: () => void;
  itemCount: number;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger className="text-[13px] text-ink-4 transition-colors hover:text-danger">
        Изпразни кошницата
      </AlertDialogTrigger>

      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia className="mx-auto size-16 rounded-full bg-bg-sunken">
            <ShoppingCart aria-hidden="true" />
          </AlertDialogMedia>
          <AlertDialogTitle className="text-lg font-semibold">
            Изпразване на кошницата
          </AlertDialogTitle>
          <AlertDialogDescription>
            Сигурни ли сте, че искате да премахнете всичките {itemCount}{" "}
            {plural(itemCount, "артикул", "артикула")} от кошницата ви?
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="border-t-0 bg-transparent">
          <AlertDialogCancel size="lg">Отказ</AlertDialogCancel>
          <AlertDialogAction size="lg" onClick={onConfirm}>
            Изпразни
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
