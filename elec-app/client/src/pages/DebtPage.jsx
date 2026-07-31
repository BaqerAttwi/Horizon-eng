import DebtList from '../components/DebtList';

export default function DebtPage() {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">💸 Debt</div>
          <div className="page-subtitle">Approved projects with an outstanding balance — click a project for full payment history</div>
        </div>
      </div>
      <DebtList />
    </div>
  );
}
