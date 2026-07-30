import { LoginForm } from './LoginForm'

export default function LoginPage() {
  return (
    <div className="h-full flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-xl p-6">
        <h1 className="text-lg font-semibold text-slate-800 mb-1">Temporalias</h1>
        <p className="text-sm text-slate-400 mb-5">Iniciá sesión para continuar</p>
        <LoginForm />
      </div>
    </div>
  )
}
