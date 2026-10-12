// The pinned react-bootstrap fork ships no type declarations. Components that
// need it cast through `unknown` to a narrow, locally-defined prop shape (see
// create_event_modal.tsx and create_event_form.tsx), so this only needs to
// unblock the module resolution itself.
declare module 'react-bootstrap';
