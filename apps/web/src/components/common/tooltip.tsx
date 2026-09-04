"use client";

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { useId, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type TooltipSide = "top" | "bottom" | "left" | "right";

interface TooltipProps {
  /** The bold first line — what the thing is, or the state it is in. */
  label: ReactNode;
  /** What it does, when the label alone does not say it. */
  description?: ReactNode;
  side?: TooltipSide;
  /**
   * The element the tooltip describes. Rendered as itself with the trigger's
   * behaviour merged in, so a control keeps its own tag, role and handlers —
   * nesting a switch inside a trigger button would be invalid markup.
   */
  children: ReactElement;
}

/**
 * The dark hint panel used for controls whose label has no room to explain
 * them. Replaces the native `title` attribute, which cannot be styled, is
 * unreadable on a dense row and never appears on touch.
 *
 * A tooltip is the wrong home for anything a visitor must read: it opens on
 * hover or focus only, so what it says has to be an elaboration of something
 * already on screen.
 */
export function Tooltip({
  label,
  description,
  side = "top",
  children,
}: TooltipProps) {
  // Base UI wires no `aria-describedby` of its own, so the panel would be
  // invisible to assistive tech — a step back from the `title` attribute this
  // replaces, which browsers do expose as the description. The id resolves only
  // while the panel is mounted, which is the moment it matters: focusing the
  // trigger is one of the things that opens it.
  const panelId = useId();

  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger render={children} aria-describedby={panelId} />

      <TooltipPrimitive.Portal>
        {/* Above the search dropdown and the sticky header, both of which a
            tooltip in the search bar opens across. */}
        <TooltipPrimitive.Positioner side={side} sideOffset={6} className="z-[60]">
          <TooltipPrimitive.Popup
            id={panelId}
            className={cn(
              "rounded-lg bg-ink shadow-overlay",
              // A lone label is a word or two and reads as a label at tooltip
              // padding; a description needs room to wrap.
              description ? "max-w-[272px] px-3.5 py-3" : "px-2.5 py-1.5",
            )}
          >
            {/* Base UI positions the arrow on the cross axis only, leaving the
                side axis to us — hence the per-side pull back over the edge. */}
            <TooltipPrimitive.Arrow
              className={cn(
                "h-2 w-2 rotate-45 rounded-[1px] bg-ink",
                "data-[side=bottom]:-top-1 data-[side=top]:-bottom-1",
                "data-[side=left]:-right-1 data-[side=right]:-left-1",
              )}
            />

            <p className="text-[12.5px] font-semibold leading-snug text-white">
              {label}
            </p>

            {description && (
              <p className="mt-1 text-[12px] leading-relaxed text-white/70">
                {description}
              </p>
            )}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
