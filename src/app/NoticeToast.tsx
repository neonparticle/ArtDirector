import { AlertTriangle, Check } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useNotice } from "@/stores/notice";

export function NoticeToast() {
  const notice = useNotice((s) => s.notice);
  const dismiss = useNotice((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-[60] flex justify-center">
      <AnimatePresence>
        {notice && (
          <motion.button
            key={notice.id}
            type="button"
            onClick={() => dismiss(notice.id)}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className={cn(
              "forge-panel pointer-events-auto flex max-w-[60vw] items-center gap-2 rounded-md px-3 py-2 text-[13px] shadow-lg backdrop-blur",
              notice.tone === "error" ? "text-arc" : "text-bone",
            )}
          >
            {notice.tone === "error" ? (
              <AlertTriangle className="size-4 shrink-0" />
            ) : (
              <Check className="size-4 shrink-0 text-ember" />
            )}
            <span className="truncate">{notice.text}</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
