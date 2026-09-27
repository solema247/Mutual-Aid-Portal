import { handleF5ListGet } from '@/lib/f4f5/f5ListHandler'

export async function GET(request: Request) {
  return handleF5ListGet(request)
}
