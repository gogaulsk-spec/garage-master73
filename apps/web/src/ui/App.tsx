import { Routes, Route } from "react-router-dom";
import Shell from "./Shell";
import Home from "../views/Home";
import Feed from "../views/Feed";
import Search from "../views/Search";
import Garage from "../views/Garage";
import Login from "../views/Login";
import Register from "../views/Register";
import Admin from "../views/Admin";
import Master from "../views/Master";
import Me from "../views/Me";
import Favorites from "../views/Favorites";
import Privacy from "../views/Privacy";
import Support from "../views/Support";
import NotFound from "../views/NotFound";

export default function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/feed" element={<Feed />} />
        <Route path="/search" element={<Search />} />
        <Route path="/favorites" element={<Favorites />} />
        <Route path="/garage/:id" element={<Garage />} />
        <Route path="/auth/login" element={<Login />} />
        <Route path="/auth/register" element={<Register />} />
        <Route path="/me" element={<Me />} />
        <Route path="/master" element={<Master />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/support" element={<Support />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Shell>
  );
}
