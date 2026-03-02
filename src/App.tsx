import { BrowserRouter, Routes, Route } from "react-router-dom";
import AddPerson from "./pages/AddPerson";
import PeopleList from "./pages/PeopleList";
import PersonDetail from "./pages/PersonDetail";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PeopleList />} />
        <Route path="/add" element={<AddPerson />} />
        <Route path="/person/:id" element={<PersonDetail />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
