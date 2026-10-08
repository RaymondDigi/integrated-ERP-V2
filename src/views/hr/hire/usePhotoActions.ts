import { useApp } from '../../../context/AppContext';
import type { HREmployee } from '../../../types';
import { todayIso } from '../../../data/hireEngine';

/** Saves or removes an employee photo on the record, with a history line and an audit entry. */
export const usePhotoActions = () => {
  const { updateHrEmployee, logEmployeeEdit, addToast } = useApp();
  const setPhoto = (e: HREmployee, photoUrl: string | undefined, by: string) => {
    const summary = photoUrl ? (e.photoUrl ? 'Profile photo changed' : 'Profile photo added') : 'Profile photo removed';
    updateHrEmployee(e.staffId, {
      photoUrl,
      history: [...(e.history ?? []), { date: todayIso(), kind: 'Details updated', summary, by }]
    });
    logEmployeeEdit(e.staffId, [{ action: summary }], by);
    addToast({
      type: 'success',
      title: summary,
      message: `${e.fullName} — shown in the directory, profile and the employee portal.`
    });
  };
  const photoError = (message: string) => addToast({ type: 'error', title: 'Photo not accepted', message });
  return { setPhoto, photoError };
};
