declare module '@/components/ui/label' {
  export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}
  export const Label: React.FC<LabelProps>;
} 