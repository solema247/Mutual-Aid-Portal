import { InputHTMLAttributes } from "react"

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  className?: string;
  type?: string;
}

declare module '@/components/ui/input' {
  export const Input: React.FC<InputProps>;
} 