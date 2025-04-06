declare module '@/components/ui/button' {
  export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}
  export const Button: React.FC<ButtonProps>;
} 