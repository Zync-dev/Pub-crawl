"use client";

import { CloudUpload } from "lucide-react";
import { Icon } from "./ds";

// Lille mærke i headeren, så længe noget i drinkkøen venter på net. Guldkant på den grønne bund.
export function OutboxBadge({ count }: { count: number }) {
  return (
    <span
      className="pc-badge pc-fade-in"
      role="status"
      aria-label={`${count} venter på net`}
      style={{ borderColor: "var(--gold-500)", color: "var(--gold-300)" }}
    >
      <Icon name={CloudUpload} size={12} />
      <span className="tabular-nums">{count} venter</span>
    </span>
  );
}
