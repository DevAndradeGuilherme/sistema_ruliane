'use client';
export default function Error({ reset }: { error: Error; reset: () => void }) { return <div className="state-page" role="alert"><h1>Não foi possível carregar esta página</h1><p>Tente novamente. Se o problema continuar, procure o responsável pelo sistema.</p><button className="button" onClick={reset}>Tentar novamente</button></div>; }
