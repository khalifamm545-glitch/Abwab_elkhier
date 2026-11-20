import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Package,
  Plus,
} from 'lucide-react';
import {useCallback, useEffect, useState, type FormEvent} from 'react';
import {api, ApiError} from '../../lib/api';
import {formatInteger} from '../../lib/formatters';
import {
  WAREHOUSE_CATEGORY_LABELS_AR,
  WAREHOUSE_CONDITION_LABELS_AR,
  type RolePermissionMatrix,
  type WarehouseCategory,
  type WarehouseCondition,
  type WarehouseItem,
  type WarehouseMovement,
} from '../../types/auth';

interface WarehousePanelProps {
  permissions: RolePermissionMatrix;
  onFeedback: (msg: {type: 'success' | 'error'; text: string}) => void;
  onDataChanged: () => Promise<void>;
}

const WH_CATEGORIES = Object.keys(WAREHOUSE_CATEGORY_LABELS_AR) as WarehouseCategory[];
const WH_CONDITIONS = Object.keys(WAREHOUSE_CONDITION_LABELS_AR) as WarehouseCondition[];

export function WarehousePanel({permissions, onFeedback, onDataChanged}: WarehousePanelProps) {
  const [items, setItems] = useState<WarehouseItem[]>([]);
  const [movements, setMovements] = useState<WarehouseMovement[]>([]);
  const [lowStockItems, setLowStockItems] = useState<WarehouseItem[]>([]);
  const [families, setFamilies] = useState<
    Array<{id: string; fileNumber: string; headOfHousehold: string}>
  >([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Add Item Form
  const [showAddItem, setShowAddItem] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<WarehouseCategory>('clothing');
  const [condition, setCondition] = useState<WarehouseCondition>('new');
  const [unit, setUnit] = useState('قطعة');
  const [initialQty, setInitialQty] = useState('10');
  const [minStockAlert, setMinStockAlert] = useState('3');
  const [donationSource, setDonationSource] = useState('تبرع عيني');
  const [notes, setNotes] = useState('');

  // Movement Form
  const [movementModalItem, setMovementModalItem] = useState<{
    item: WarehouseItem;
    type: 'in' | 'out';
  } | null>(null);
  const [movQty, setMovQty] = useState('1');
  const [movFamilyId, setMovFamilyId] = useState('');
  const [movSourceOrBen, setMovSourceOrBen] = useState('');
  const [movNotes, setMovNotes] = useState('');

  const loadWarehouse = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getWarehouse();
      setItems(res.items);
      setMovements(res.movements);
      setLowStockItems(res.lowStockItems);
      setFamilies(res.families);
    } catch (err) {
      onFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'تعذر تحميل بيانات المخازن.',
      });
    } finally {
      setLoading(false);
    }
  }, [onFeedback]);

  useEffect(() => {
    void loadWarehouse();
  }, [loadWarehouse]);

  const handleAddItem = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.createWarehouseItem({
        name,
        category,
        condition,
        unit,
        initialQty: Number(initialQty) || 0,
        minStockAlert: Number(minStockAlert) || 0,
        donationSource,
        notes,
      });
      setName('');
      setNotes('');
      setShowAddItem(false);
      onFeedback({type: 'success', text: 'تم تسجيل الصنف العيني بالمخزن بنجاح.'});
      await loadWarehouse();
      await onDataChanged();
    } catch (err) {
      onFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'تعذر إضافة الصنف للمخزن.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleMovement = async (e: FormEvent) => {
    e.preventDefault();
    if (!movementModalItem) return;
    setSubmitting(true);
    try {
      await api.createWarehouseMovement({
        itemId: movementModalItem.item.id,
        movementType: movementModalItem.type,
        quantity: Number(movQty) || 1,
        beneficiaryFamilyId: movementModalItem.type === 'out' ? movFamilyId || null : null,
        sourceOrBeneficiary: movSourceOrBen,
        notes: movNotes,
      });
      onFeedback({
        type: 'success',
        text:
          movementModalItem.type === 'in'
            ? 'تم تسجيل الوارد المخزني وتحديث الرصيد.'
            : 'تم تسجيل الصرف العيني وربطه بالأسرة المستفيدة بنجاح.',
      });
      setMovementModalItem(null);
      setMovQty('1');
      setMovFamilyId('');
      setMovSourceOrBen('');
      setMovNotes('');
      await loadWarehouse();
      await onDataChanged();
    } catch (err) {
      onFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'تعذر تنفيذ الحركة المخزنية.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Low Stock Alert Banner */}
      {lowStockItems.length > 0 && (
        <section className="rounded-2xl border border-amber-300 bg-amber-50/80 p-4 flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
          <div className="text-xs text-amber-950">
            <p className="font-bold">تنبيه انخفاض المخزون العيني ({lowStockItems.length} أصناف)</p>
            <p className="mt-0.5">
              الأصناف التي وصلت للحد الأدنى:{' '}
              {lowStockItems.map((i) => `${i.name} (متبقي ${i.availableQty} ${i.unit})`).join(' · ')}
            </p>
          </div>
        </section>
      )}

      {/* Header & Add Item Form */}
      <section className="rounded-3xl border border-[#167764]/12 bg-white p-5 sm:p-6 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-xl font-extrabold text-[#0F4F42]">
              إدارة المخازن والتبرعات العينية
            </h2>
            <p className="mt-1 text-xs text-[#102A24]/65">
              متابعة الوارد والمنصرف والمتبقي للأصناف العينية مع منع صرف كمية تتجاوز الرصيد المتاح وربط الصرف بالأسر المستفيدة.
            </p>
          </div>
          {permissions.canAddData && (
            <button
              type="button"
              onClick={() => setShowAddItem((v) => !v)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#167764] px-4 py-2 text-xs font-bold text-white hover:bg-[#0F4F42] cursor-pointer self-start"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>{showAddItem ? 'إغلاق' : 'تسجيل صنف عيني جديد'}</span>
            </button>
          )}
        </div>

        {showAddItem && permissions.canAddData && (
          <form
            onSubmit={handleAddItem}
            className="rounded-2xl border border-[#167764]/18 bg-[#F7FAF8] p-4 space-y-3.5"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-[#0F4F42]">اسم الصنف *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: بطاطين شتوية / ثلاجة / كرسي متحرك / كرتونة غذائية"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#0F4F42]">التصنيف</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as WarehouseCategory)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3 text-sm"
                >
                  {WH_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {WAREHOUSE_CATEGORY_LABELS_AR[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#0F4F42]">حالة الصنف</label>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value as WarehouseCondition)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3 text-sm"
                >
                  {WH_CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {WAREHOUSE_CONDITION_LABELS_AR[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#0F4F42]">الكمية الواردة *</label>
                <input
                  type="number"
                  min={0}
                  required
                  value={initialQty}
                  onChange={(e) => setInitialQty(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3.5 text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#0F4F42]">الوحدة</label>
                <input
                  type="text"
                  required
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#0F4F42]">حد تنبيه النقص</label>
                <input
                  type="number"
                  min={0}
                  value={minStockAlert}
                  onChange={(e) => setMinStockAlert(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3.5 text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#0F4F42]">مصدر التبرع</label>
                <input
                  type="text"
                  value={donationSource}
                  onChange={(e) => setDonationSource(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-white px-3.5 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddItem(false)}
                className="min-h-[44px] rounded-xl border border-[#167764]/20 bg-white px-4 text-xs font-semibold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[44px] rounded-xl bg-[#167764] px-5 text-xs font-bold text-white hover:bg-[#0F4F42] disabled:opacity-50 cursor-pointer"
              >
                حفظ الصنف
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Inventory Cards */}
      {loading && items.length === 0 ? (
        <div className="h-44 animate-pulse rounded-3xl bg-white border border-[#167764]/10" />
      ) : items.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-[#167764]/20 bg-white p-8 text-center">
          <Package className="mx-auto h-8 w-8 text-[#167764]/45" aria-hidden="true" />
          <p className="mt-2 font-display text-base font-bold text-[#0F4F42]">
            المخزن العيني فارغ حالياً
          </p>
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {items.map((item) => {
            const isLow = item.availableQty <= item.minStockAlert;
            return (
              <article
                key={item.id}
                className={`rounded-3xl border bg-white p-5 space-y-3 ${
                  isLow ? 'border-amber-300' : 'border-[#167764]/14'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-[#167764] tabular-nums">
                      {item.itemCode} · {WAREHOUSE_CATEGORY_LABELS_AR[item.category]} ·{' '}
                      {WAREHOUSE_CONDITION_LABELS_AR[item.condition]}
                    </p>
                    <h3 className="mt-0.5 font-display text-base font-extrabold text-[#0F4F42]">
                      {item.name}
                    </h3>
                    <p className="mt-0.5 text-[11px] text-[#102A24]/65">
                      المصدر: {item.donationSource} · تاريخ الاستلام: {item.receivedDate}
                    </p>
                  </div>
                  <div className="text-left">
                    <p
                      className={`font-display text-2xl font-extrabold tabular-nums ${
                        isLow ? 'text-amber-700' : 'text-[#0F4F42]'
                      }`}
                    >
                      {formatInteger(item.availableQty)}{' '}
                      <span className="text-xs font-bold">{item.unit}</span>
                    </p>
                    <p className="text-[11px] text-[#102A24]/60 tabular-nums">
                      وارد: {item.totalIn} · منصرف: {item.totalOut}
                    </p>
                  </div>
                </div>

                {permissions.canAddData && (
                  <div className="flex flex-wrap gap-2 border-t border-[#167764]/10 pt-3">
                    <button
                      type="button"
                      onClick={() => setMovementModalItem({item, type: 'in'})}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3.5 py-1.5 text-xs font-bold text-[#0F4F42] hover:bg-[#EEF7F0] cursor-pointer"
                    >
                      <ArrowDownToLine className="h-4 w-4 text-[#167764]" aria-hidden="true" />
                      <span>إضافة وارد</span>
                    </button>
                    <button
                      type="button"
                      disabled={item.availableQty <= 0}
                      onClick={() => setMovementModalItem({item, type: 'out'})}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#167764] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#0F4F42] disabled:opacity-45 cursor-pointer"
                    >
                      <ArrowUpFromLine className="h-4 w-4" aria-hidden="true" />
                      <span>صرف عيني لمستفيد</span>
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Recent Movements Ledger */}
      {movements.length > 0 && (
        <section className="rounded-3xl border border-[#167764]/12 bg-white p-5 sm:p-6">
          <h3 className="font-display text-base font-extrabold text-[#0F4F42]">
            سجل حركات الوارد والمنصرف المخزني
          </h3>
          <div className="mt-4 divide-y divide-[#167764]/10">
            {movements.slice(0, 15).map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 py-3 text-xs">
                <div>
                  <p className="font-bold text-[#0F4F42]">
                    {m.movementType === 'in' ? 'وارد مخزني' : 'صرف عيني'} — {m.itemName} ({m.itemCode})
                  </p>
                  <p className="mt-0.5 text-[#102A24]/65">
                    {m.movementDate} · {m.beneficiaryFamilyName || m.sourceOrBeneficiary} ·{' '}
                    بواسطة {m.recordedByName}
                  </p>
                </div>
                <span
                  className={`font-display text-sm font-extrabold tabular-nums ${
                    m.movementType === 'in' ? 'text-[#167764]' : 'text-amber-700'
                  }`}
                >
                  {m.movementType === 'in' ? '+' : '-'}
                  {formatInteger(m.quantity)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Movement Modal */}
      {movementModalItem && (
        <div
          dir="rtl"
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#102A24]/45 p-3 backdrop-blur-xs sm:items-center"
        >
          <form
            onSubmit={handleMovement}
            className="w-full max-w-md rounded-3xl border border-[#167764]/20 bg-white p-5 shadow-xl space-y-4"
          >
            <h3 className="font-display text-base font-extrabold text-[#0F4F42]">
              {movementModalItem.type === 'in' ? 'إضافة وارد للمخزن' : 'صرف عيني من المخزن'} —{' '}
              {movementModalItem.item.name}
            </h3>
            <p className="text-xs text-[#102A24]/70 tabular-nums">
              الرصيد المتاح حالياً: <strong>{movementModalItem.item.availableQty}</strong>{' '}
              {movementModalItem.item.unit}
            </p>
            <div>
              <label className="block text-xs font-bold text-[#0F4F42]">الكمية *</label>
              <input
                type="number"
                min={1}
                max={movementModalItem.type === 'out' ? movementModalItem.item.availableQty : 100000}
                required
                value={movQty}
                onChange={(e) => setMovQty(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3.5 text-sm tabular-nums"
              />
            </div>
            {movementModalItem.type === 'out' && families.length > 0 && (
              <div>
                <label className="block text-xs font-bold text-[#0F4F42]">
                  الأسرة المستفيدة المستلمة
                </label>
                <select
                  value={movFamilyId}
                  onChange={(e) => setMovFamilyId(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3 text-sm"
                >
                  <option value="">— صرف ميداني عام —</option>
                  {families.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.fileNumber} — {f.headOfHousehold}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-[#0F4F42]">
                {movementModalItem.type === 'in' ? 'اسم المتبرع / المصدر' : 'اسم المستلم (إن لم يكن مسجلاً)'}
              </label>
              <input
                type="text"
                value={movSourceOrBen}
                onChange={(e) => setMovSourceOrBen(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#0F4F42]">ملاحظات</label>
              <input
                type="text"
                value={movNotes}
                onChange={(e) => setMovNotes(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-[#167764]/20 bg-[#F7FAF8] px-3.5 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMovementModalItem(null)}
                className="min-h-[44px] rounded-xl border border-[#167764]/20 bg-white px-4 text-xs font-semibold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[44px] rounded-xl bg-[#167764] px-5 text-xs font-bold text-white hover:bg-[#0F4F42] disabled:opacity-50 cursor-pointer"
              >
                تأكيد الحركة
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
