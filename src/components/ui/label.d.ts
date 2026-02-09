import { LabelHTMLAttributes } from "react"

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  className?: string;
  htmlFor?: string;
}

declare module '@/components/ui/label' {
  export const Label: React.FC<LabelProps>;
} 