import { handleF4ListGet } from '@/lib/f4f5/f4ListHandler'

export async function GET(request: Request) {
  return handleF4ListGet(request)
}
