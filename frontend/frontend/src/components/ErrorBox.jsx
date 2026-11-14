// Понятное сообщение вместо белого экрана.
export default function ErrorBox({ message, onRetry, onHome, retryLabel = 'Повторить' }) {
  if (!message) return null
  return (
    <div className="errbox" role="alert">
      <div className="errbox-text">{message}</div>
      <div className="errbox-actions">
        {onRetry && (
          <button className="btn small" onClick={onRetry}>
            {retryLabel}
          </button>
        )}
        {onHome && (
          <button className="btn small ghost" onClick={onHome}>
            Закрыть
          </button>
        )}
      </div>
    </div>
  )
}
