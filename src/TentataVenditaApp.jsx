import React, { useReducer, useContext, useState, useEffect } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  Navigate,
  Outlet,
  useParams,
  useNavigate,
} from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/**********************
 * 1. STORE & CONTEXT *
 ************************/
const StoreCtx = React.createContext(null);

const demoArticles = [
  { id: 1, codice: 'AR001', descrizione: 'Articolo A', um: 'PZ', prezzo: 10 },
  { id: 2, codice: 'AR002', descrizione: 'Articolo B', um: 'PZ', prezzo: 20 },
  { id: 3, codice: 'AR003', descrizione: 'Articolo C', um: 'PZ', prezzo: 12 },
];
const demoClients = [
  { id: 1, codice: 'CL001', ragione_sociale: 'Cliente Demo srl' },
];

const initialState = {
  articles: demoArticles,
  clienti: demoClients,
  scorte: {},
  caricoDraft: [],
  docs: [],
  incassi: [],
  resoDraft: [],
};

const calcTotale = (lines) =>
  lines.reduce((s, l) => s + l.qty * l.prezzoUnitario, 0);

function reducer(state, action) {
  switch (action.type) {
    /* ----------------- CARICO ----------------- */
    case 'ADD_CARICO_LINE': {
      const { idArticolo, qty } = action;
      const draft = [...state.caricoDraft];
      const idx = draft.findIndex((l) => l.idArticolo === idArticolo);
      idx >= 0 ? (draft[idx].qty += qty) : draft.push({ idArticolo, qty });
      return { ...state, caricoDraft: draft };
    }
    case 'CONFIRM_CARICO': {
      const stock = { ...state.scorte };
      state.caricoDraft.forEach((l) => {
        stock[l.idArticolo] = (stock[l.idArticolo] || 0) + l.qty;
      });
      return { ...state, scorte: stock, caricoDraft: [] };
    }

    /* --------------- DOCUMENTI --------------- */
    case 'ADD_DOCUMENT': {
      const { idCliente, tipo, lines } = action;
      const id = `DOC${Date.now()}`;
      const docLines = lines.map((l) => ({ ...l, totaleRiga: l.qty * l.prezzoUnitario }));
      const stock = { ...state.scorte };
      docLines.forEach((l) => {
        stock[l.idArticolo] = (stock[l.idArticolo] || 0) - l.qty;
      });
      return {
        ...state,
        scorte: stock,
        docs: [...state.docs, { id, idCliente, tipo, lines: docLines, totale: calcTotale(docLines) }],
      };
    }
    case 'ADD_LINE_TO_DOC': {
      const { docId, line } = action;
      const docs = state.docs.map((d) =>
        d.id === docId
          ? {
              ...d,
              lines: [...d.lines, { ...line, totaleRiga: line.qty * line.prezzoUnitario }],
              totale: calcTotale([
                ...d.lines,
                { ...line, totaleRiga: line.qty * line.prezzoUnitario },
              ]),
            }
          : d,
      );
      const stock = { ...state.scorte };
      stock[line.idArticolo] = (stock[line.idArticolo] || 0) - line.qty;
      return { ...state, docs, scorte: stock };
    }
    case 'UPDATE_DOC_LINE': {
      const { docId, index, field, value } = action;
      const docs = state.docs.map((d) => {
        if (d.id !== docId) return d;
        const old = d.lines[index];
        const upd = { ...old };
        if (field === 'qty') {
          const diff = value - old.qty;
          upd.qty = value;
          state.scorte[old.idArticolo] =
            (state.scorte[old.idArticolo] || 0) - diff;
        }
        if (field === 'prezzoUnitario') upd.prezzoUnitario = value;
        upd.totaleRiga = upd.qty * upd.prezzoUnitario;
        const newLines = d.lines.map((l, i) => (i === index ? upd : l));
        return { ...d, lines: newLines, totale: calcTotale(newLines) };
      });
      return { ...state, docs };
    }
    case 'DELETE_DOC_LINE': {
      const { docId, index } = action;
      const docs = state.docs.map((d) => {
        if (d.id !== docId) return d;
        const removed = d.lines[index];
        const remaining = d.lines.filter((_, i) => i !== index);
        if (removed)
          state.scorte[removed.idArticolo] =
            (state.scorte[removed.idArticolo] || 0) + removed.qty;
        return { ...d, lines: remaining, totale: calcTotale(remaining) };
      });
      return { ...state, docs };
    }

    /* ---------------- INCASSI --------------- */
    case 'REGISTER_INCASSO':
      return { ...state, incassi: [...state.incassi, action.incasso] };

    /* ----------------- RESI ----------------- */
    case 'GENERATE_RESO_FROM_SCORTE': {
      const lines = Object.entries(state.scorte)
        .filter(([, q]) => q > 0)
        .map(([id, qty]) => {
          const art = state.articles.find((a) => a.id === parseInt(id));
          return { idArticolo: art.id, um: art.um, qty };
        });
      return { ...state, resoDraft: lines };
    }
    case 'CONFIRM_RESO': {
      const id = `RESO${Date.now()}`;
      const stock = { ...state.scorte };
      state.resoDraft.forEach((l) => {
        stock[l.idArticolo] = (stock[l.idArticolo] || 0) - l.qty;
      });
      const resoDoc = {
        id,
        idCliente: null,
        tipo: 'RESO',
        lines: state.resoDraft.map((l) => ({ ...l, prezzoUnitario: 0, totaleRiga: 0 })),
        totale: 0,
      };
      return { ...state, docs: [...state.docs, resoDoc], scorte: stock, resoDraft: [] };
    }
    default:
      return state;
  }
}

const StoreProvider = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  return <StoreCtx.Provider value={{ state, dispatch }}>{children}</StoreCtx.Provider>;
};
const useStore = () => useContext(StoreCtx);

/**********************
 * 2. LAYOUT & MENU   *
 **********************/
const MenuLink = ({ to, label }) => (
  <Link to={to} className="block px-4 py-2 rounded hover:bg-gray-200">
    {label}
  </Link>
);

const Layout = () => (
  <div className="flex h-screen">
    <aside className="w-56 bg-gray-100 p-4 space-y-4">
      <nav className="grid gap-2 text-sm font-medium">
        <MenuLink to="/dashboard/catalogo" label="Catalogo" />
        <MenuLink to="/dashboard/documenti" label="Documenti" />
        <MenuLink to="/dashboard/carico" label="Carico" />
        <MenuLink to="/dashboard/resi" label="Reso" />
        <MenuLink to="/dashboard/incassi" label="Incassi" />
        <MenuLink to="/dashboard/sync" label="Sync" />
      </nav>
    </aside>
    <main className="flex-1 p-6 overflow-y-auto bg-white">
      <Outlet />
    </main>
  </div>
);

/**********************
 * 3. PAGES            *
 **********************/
/* CARICO ---------------------------------------*/
function CaricoPage() {
  const { state, dispatch } = useStore();
  const [idArt, setIdArt] = useState(state.articles[0].id);
  const [qty, setQty] = useState(1);

  return (
    <Card>
      <CardContent className="space-y-4">
        <h2 className="text-xl font-bold">Carico mattutino</h2>
        <div className="flex gap-2 items-center">
          <select
            value={idArt}
            onChange={(e) => setIdArt(parseInt(e.target.value))}
            className="border p-2 rounded"
          >
            {state.articles.map((a) => (
              <option key={a.id} value={a.id}>
                {a.descrizione}
              </option>
            ))}
          </select>
          <Input
            type="number"
            value={qty}
            onChange={(e) => setQty(parseFloat(e.target.value))}
            style={{ width: '120px' }}
          />
          <Button onClick={() => dispatch({ type: 'ADD_CARICO_LINE', idArticolo: idArt, qty })}>Aggiungi</Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Articolo</TableHead>
              <TableHead>Qta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.caricoDraft.map((l) => {
              const art = state.articles.find((a) => a.id === l.idArticolo);
              return (
                <TableRow key={l.idArticolo}>
                  <TableCell>{art.descrizione}</TableCell>
                  <TableCell>{l.qty}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <Button disabled={!state.caricoDraft.length} onClick={() => dispatch({ type: 'CONFIRM_CARICO' })}>
          Conferma Carico
        </Button>
      </CardContent>
    </Card>
  );
}

/* CATALOGO -> NUOVO DOCUMENTO ---------------*/
function CatalogoPage() {
  const { state, dispatch } = useStore();
  const [idArt, setIdArt] = useState(state.articles[0].id);
  const [qty, setQty] = useState(1);
  const [docType, setDocType] = useState('DDT');
  const artSel = state.articles.find((a) => a.id === idArt);
  const [price, setPrice] = useState(artSel.prezzo);
  const [linesDraft, setLinesDraft] = useState([]);

  const addLine = () => {
    setLinesDraft([...linesDraft, { idArticolo: idArt, um: artSel.um, qty, prezzoUnitario: price }]);
    setQty(1);
  };

  const createDoc = () => {
    if (!linesDraft.length) return;
    dispatch({ type: 'ADD_DOCUMENT', idCliente: 1, tipo: docType, lines: linesDraft });
    setLinesDraft([]);
  };

  return (
    <Card>
      <CardContent className="space-y-4">
        <h2 className="text-xl font-bold">Nuovo documento ({docType})</h2>
        <div className="flex gap-2 items-center">
          <label>Tipo:</label>
          <select value={docType} onChange={(e) => setDocType(e.target.value)} className="border p-2 rounded">
            <option value="DDT">DDT</option>
            <option value="FATTURA">FATTURA</option>
            <option value="BUONO">BUONO</option>
          </select>
        </div>
        <div className="flex gap-2 items-center">
          <select
            value={idArt}
            onChange={(e) => {
              const id = parseInt(e.target.value);
              setIdArt(id);
              const art = state.articles.find((a) => a.id === id);
              setPrice(art.prezzo);
            }}
            className="border p-2 rounded"
          >
            {state.articles.map((a) => (
              <option key={a.id} value={a.id}>
                {a.descrizione}
              </option>
            ))}
          </select>
          <Input
            type="number"
            value={qty}
            onChange={(e) => setQty(parseFloat(e.target.value))}
            style={{ width: '80px' }}
          />
          <Input
            type="number"
            value={price}
            onChange={(e) => setPrice(parseFloat(e.target.value))}
            style={{ width: '100px' }}
          />
          <Button onClick={addLine}>Aggiungi Riga</Button>
        </div>
        {linesDraft.length > 0 && (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Articolo</TableHead>
                  <TableHead>UM</TableHead>
                  <TableHead>Qta</TableHead>
                  <TableHead>Prezzo</TableHead>
                  <TableHead>Totale</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linesDraft.map((l, idx) => {
                  const art = state.articles.find((a) => a.id === l.idArticolo);
                  return (
                    <TableRow key={idx}>
                      <TableCell>{art.descrizione}</TableCell>
                      <TableCell>{l.um}</TableCell>
                      <TableCell>{l.qty}</TableCell>
                      <TableCell>€{l.prezzoUnitario.toFixed(2)}</TableCell>
                      <TableCell>€{(l.qty * l.prezzoUnitario).toFixed(2)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="text-right font-medium">
              Totale: €{calcTotale(linesDraft).toFixed(2)}
            </div>
          </>
        )}
        <Button disabled={!linesDraft.length} onClick={createDoc}>
          Crea Documento
        </Button>
      </CardContent>
    </Card>
  );
}

/* DOCUMENTI LIST ---------------------------*/
function DocumentiPage() {
  const { state } = useStore();
  const navigate = useNavigate();
  return (
    <Card>
      <CardContent className="space-y-4">
        <h2 className="text-xl font-bold">Documenti</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Totale</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.docs.map((d) => (
              <TableRow key={d.id}>
                <TableCell>{d.id}</TableCell>
                <TableCell>{d.tipo}</TableCell>
                <TableCell>€{d.totale.toFixed(2)}</TableCell>
                <TableCell>
                  <Button size="sm" onClick={() => navigate(`/dashboard/documenti/${d.id}`)}>
                    Apri
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* DOCUMENTO DETTAGLIO ----------------------*/
function DocumentoDettaglio() {
  const { state, dispatch } = useStore();
  const { docId } = useParams();
  const doc = state.docs.find((d) => d.id === docId);
  const navigate = useNavigate();
  if (!doc) return <Navigate to="/dashboard/documenti" />;

  const [idArt, setIdArt] = useState(state.articles[0].id);
  const artSel = state.articles.find((a) => a.id === idArt);
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState(artSel.prezzo);
  const addLine = () =>
    dispatch({
      type: 'ADD_LINE_TO_DOC',
      docId: doc.id,
      line: { idArticolo: idArt, um: artSel.um, qty, prezzoUnitario: price },
    });

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">
            {doc.tipo} – {doc.id}
          </h2>
          <Button size="sm" onClick={() => navigate(-1)}>
            Indietro
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Articolo</TableHead>
              <TableHead>UM</TableHead>
              <TableHead>Qta</TableHead>
              <TableHead>Prezzo</TableHead>
              <TableHead>Totale</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {doc.lines.map((l, idx) => {
              const art = state.articles.find((a) => a.id === l.idArticolo);
              return (
                <TableRow key={idx}>
                  <TableCell>{art.descrizione}</TableCell>
                  <TableCell>{l.um}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={l.qty}
                      style={{ width: '80px' }}
                      onChange={(e) =>
                        dispatch({
                          type: 'UPDATE_DOC_LINE',
                          docId: doc.id,
                          index: idx,
                          field: 'qty',
                          value: parseFloat(e.target.value),
                        })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={l.prezzoUnitario}
                      style={{ width: '100px' }}
                      onChange={(e) =>
                        dispatch({
                          type: 'UPDATE_DOC_LINE',
                          docId: doc.id,
                          index: idx,
                          field: 'prezzoUnitario',
                          value: parseFloat(e.target.value),
                        })
                      }
                    />
                  </TableCell>
                  <TableCell>€{l.totaleRiga.toFixed(2)}</TableCell>
                  <TableCell>
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={() =>
                        dispatch({ type: 'DELETE_DOC_LINE', docId: doc.id, index: idx })
                      }
                    >
                      ✕
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <div className="text-right font-semibold text-lg">
          Totale: €{doc.totale.toFixed(2)}
        </div>
        <h3 className="font-medium mt-6">Aggiungi Riga</h3>
        <div className="flex gap-2 items-center">
          <select
            value={idArt}
            onChange={(e) => {
              const id = parseInt(e.target.value);
              setIdArt(id);
              const art = state.articles.find((a) => a.id === id);
              setPrice(art.prezzo);
            }}
            className="border p-2 rounded"
          >
            {state.articles.map((a) => (
              <option key={a.id} value={a.id}>
                {a.descrizione}
              </option>
            ))}
          </select>
          <Input
            type="number"
            value={qty}
            onChange={(e) => setQty(parseFloat(e.target.value))}
            style={{ width: '80px' }}
          />
          <Input
            type="number"
            value={price}
            onChange={(e) => setPrice(parseFloat(e.target.value))}
            style={{ width: '100px' }}
          />
          <Button onClick={addLine}>Aggiungi</Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* INCASSI -----------------------------------*/
function IncassiPage() {
  const { state, dispatch } = useStore();
  const [imp, setImp] = useState(0);
  const [metodo, setMetodo] = useState('contanti');

  return (
    <Card>
      <CardContent className="space-y-4">
        <h2 className="text-xl font-bold">Incassi</h2>
        <Input
          type="number"
          value={imp}
          onChange={(e) => setImp(parseFloat(e.target.value))}
          placeholder="Importo"
        />
        <Input
          value={metodo}
          onChange={(e) => setMetodo(e.target.value)}
          placeholder="Metodo"
        />
        <Button
          onClick={() => {
            dispatch({
              type: 'REGISTER_INCASSO',
              incasso: { id: `INC${Date.now()}`, importo: imp, metodo },
            });
            setImp(0);
          }}
        >
          Registra
        </Button>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Importo</TableHead>
              <TableHead>Metodo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.incassi.map((i) => (
              <TableRow key={i.id}>
                <TableCell>{i.id}</TableCell>
                <TableCell>€{i.importo.toFixed(2)}</TableCell>
                <TableCell>{i.metodo}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* RESI --------------------------------------*/
function ResiPage() {
  const { state, dispatch } = useStore();
  useEffect(() => {
    if (!state.resoDraft.length) dispatch({ type: 'GENERATE_RESO_FROM_SCORTE' });
  }, [dispatch, state.resoDraft.length]);

  return (
    <Card>
      <CardContent className="space-y-4">
        <h2 className="text-xl font-bold">Reso proposto</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Articolo</TableHead>
              <TableHead>UM</TableHead>
              <TableHead>Qta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.resoDraft.map((l, idx) => {
              const art = state.articles.find((a) => a.id === l.idArticolo);
              return (
                <TableRow key={idx}>
                  <TableCell>{art.descrizione}</TableCell>
                  <TableCell>{l.um}</TableCell>
                  <TableCell>{l.qty}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {!state.resoDraft.length && <p>Nessuna giacenza da restituire.</p>}
        <Button disabled={!state.resoDraft.length} onClick={() => dispatch({ type: 'CONFIRM_RESO' })}>
          Conferma Reso
        </Button>
      </CardContent>
    </Card>
  );
}

/* SYNC MOCK ---------------------------------*/
function SyncPage() {
  const { state } = useStore();
  const pending = state.docs.length + state.incassi.length;
  return (
    <Card>
      <CardContent className="space-y-4">
        <h2 className="text-xl font-bold">Sincronizza</h2>
        <p>Record pendenti da inviare: {pending}</p>
        <Button>Invia ora</Button>
      </CardContent>
    </Card>
  );
}

/**********************
 * 4. MAIN APP        *
 **********************/
export default function TentataVenditaApp() {
  return (
    <StoreProvider>
      <Router>
        <Routes>
          <Route path="/dashboard" element={<Layout />}>
            <Route index element={<Navigate to="catalogo" replace />} />
            <Route path="catalogo" element={<CatalogoPage />} />
            <Route path="documenti" element={<DocumentiPage />} />
            <Route path="documenti/:docId" element={<DocumentoDettaglio />} />
            <Route path="carico" element={<CaricoPage />} />
            <Route path="resi" element={<ResiPage />} />
            <Route path="incassi" element={<IncassiPage />} />
            <Route path="sync" element={<SyncPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </StoreProvider>
  );
}
