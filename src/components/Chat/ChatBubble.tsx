import { cn } from "../../lib/utils";
import { format } from "date-fns";

interface ChatBubbleProps {
  text: string;
  timestamp: Date;
  role: "user" | "assistant" | "vet" | "system";
  senderName?: string;
}

export const ChatBubble = ({ text, timestamp, role, senderName }: ChatBubbleProps) => {
  const isUser = role === "user";
  const isSystem = role === "system";

  if (isSystem) {
    return (
      <div className="flex justify-center my-4">
        <span className="bg-amber-100 text-amber-800 text-[10px] uppercase tracking-wider font-bold px-3 py-1 rounded-full shadow-sm">
          {text}
        </span>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col mb-4 max-w-[85%]", isUser ? "ml-auto items-end" : "mr-auto items-start")}>
      {!isUser && senderName && (
        <span className="text-[10px] font-bold text-gray-500 mb-1 ml-2 uppercase tracking-wide">
          {senderName}
        </span>
      )}
      <div
        className={cn(
          "px-4 py-2.5 rounded-2xl shadow-sm text-sm relative",
          isUser
            ? "bg-[#D9FDD3] text-[#111B21] rounded-tr-none"
            : role === "vet"
            ? "bg-blue-50 border border-blue-100 text-[#111B21] rounded-tl-none"
            : "bg-white text-[#111B21] rounded-tl-none"
        )}
      >
        <p className="whitespace-pre-wrap leading-relaxed">{text}</p>
        <div className={cn("text-[10px] mt-1 text-right opacity-60", isUser ? "text-gray-600" : "text-gray-500")}>
          {format(timestamp, "HH:mm")}
        </div>
      </div>
    </div>
  );
};
