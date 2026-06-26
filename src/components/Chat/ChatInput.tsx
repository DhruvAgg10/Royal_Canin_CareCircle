import { SendHorizontal, Mic, Plus } from "lucide-react";
import { useState } from "react";

interface ChatInputProps {
  onSend: (text: string) => void;
}

export const ChatInput = ({ onSend }: ChatInputProps) => {
  const [text, setText] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) {
      onSend(text);
      setText("");
    }
  };

  return (
    <div className="bg-gray-100 p-2 flex items-center gap-2 border-t border-gray-200">
      <button className="p-1.5 text-gray-400 hover:text-wa-teal transition-colors rounded-full">
        <Plus className="w-5 h-5" />
      </button>
      
      <form onSubmit={handleSubmit} className="flex-1 flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 bg-white rounded-full h-8 px-4 text-[11px] text-gray-700 focus:outline-none placeholder:text-gray-400 border border-gray-200"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="w-8 h-8 bg-wa-teal text-white rounded-full flex items-center justify-center disabled:bg-gray-300 transition-all hover:scale-105"
        >
          {text.trim() ? <SendHorizontal className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
};
