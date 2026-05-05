import { AlertTriangle } from 'lucide-react'
import Modal from './Modal'

export default function ConfirmDialog({ open, onClose, onConfirm, title, message, loading }) {
  return (
    <Modal open={open} onClose={onClose} title={title || 'Confirmar acción'} size="sm">
      <div className="flex flex-col items-center gap-4 py-2">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
          <AlertTriangle className="text-red-600" size={24} />
        </div>
        <p className="text-center text-gray-600 text-sm">{message || '¿Estás seguro de que deseas continuar?'}</p>
        <div className="flex gap-3 w-full pt-2">
          <button onClick={onClose} className="btn-secondary flex-1" disabled={loading}>Cancelar</button>
          <button onClick={onConfirm} className="btn-danger flex-1" disabled={loading}>
            {loading ? 'Procesando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
