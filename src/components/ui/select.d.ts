declare module '@/components/ui/select' {
  export interface SelectProps {
    onValueChange: (value: string) => void;
    value?: string;
    children: React.ReactNode;
  }
  
  export const Select: React.FC<SelectProps>;
  export const SelectContent: React.FC<{ children: React.ReactNode }>;
  export const SelectItem: React.FC<{ value: string; children: React.ReactNode }>;
  export const SelectTrigger: React.FC<{ 
    children: React.ReactNode;
    id?: string;
  }>;
  export const SelectValue: React.FC<{ placeholder?: string }>;
} 