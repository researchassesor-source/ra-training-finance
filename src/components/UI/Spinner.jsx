export default function Spinner({ size = 'md', text }) {
  const s = { sm: 'h-4 w-4', md: 'h-8 w-8', lg: 'h-12 w-12' }
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10">
      <div className={`${s[size]} animate-spin rounded-full border-4 border-gray-200 border-t-brand-600`} />
      {text && <p className="text-sm text-gray-500">{text}</p>}
    </div>
  )
}
