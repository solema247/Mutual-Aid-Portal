import { ButtonHTMLAttributes } from "react"

// This interface extends ButtonHTMLAttributes to allow for additional props in the future
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  // Additional props can be added here
  variant?: 'default' | 'outline' | 'ghost'
}

declare module '@/components/ui/button' {
  export const Button: React.FC<ButtonProps>;
} 