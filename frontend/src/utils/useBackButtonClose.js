import { useEffect, useRef } from 'react';

// Wire the device "back" gesture / button to close a modal instead of exiting
// the app on the first press. The hook pushes a synthetic history entry on
// mount and listens for popstate; if the user navigates back, we run
// `onClose`. If the modal is closed by other means (Cancel / Save / outside
// click), the cleanup pops the synthetic entry so the history stack stays
// balanced.
export default function useBackButtonClose(onClose) {
  // onClose changes identity on every render — keep a ref so the effect
  // only runs once on mount/unmount.
  const cbRef = useRef(onClose);
  cbRef.current = onClose;

  useEffect(() => {
    let poppedByUser = false;
    try {
      window.history.pushState({ smModal: true }, '');
    } catch {}

    function onPop() {
      poppedByUser = true;
      try { cbRef.current?.(); } catch {}
    }
    window.addEventListener('popstate', onPop);

    return () => {
      window.removeEventListener('popstate', onPop);
      if (!poppedByUser) {
        // Modal closed without a back gesture — clean up our pushed entry.
        try { window.history.back(); } catch {}
      }
    };
  }, []);
}
