"use client";

import { useClerk } from "@clerk/nextjs";
import { UserX } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Blocks the shop for a Clerk account we cannot file as a customer. Nothing on
 * the page can fix that, so it offers only signing out.
 */
export function AccountSetupFailed() {
  const { signOut } = useClerk();

  return (
    <AlertDialog open>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia className="mx-auto size-16 rounded-full bg-bg-sunken">
            <UserX className="h-6 w-6 text-ink-3" aria-hidden="true" />
          </AlertDialogMedia>
          <AlertDialogTitle className="text-lg font-semibold">
            Профилът ви не можа да бъде създаден
          </AlertDialogTitle>
          <AlertDialogDescription>
            Свържете се с нас, за да довършим регистрацията ви, или излезте от
            профила, за да продължите като гост.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={() => signOut()}>Изход</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
