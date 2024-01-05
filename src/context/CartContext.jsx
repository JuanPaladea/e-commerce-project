import { collection, deleteDoc, doc, getDoc, getDocs, getFirestore, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { createContext, useContext, useEffect, useState } from "react";
import { useUser } from "./UserContext";
import { toast } from "react-toastify";

const CartContext = createContext()

export const CartProvider = ({ children }) => {
    const [cart, setCart] = useState([])
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false)
    const db = getFirestore();
    const {user} = useUser()
    const totalPrice = cart.map((item) => item.price * item.quantity).reduce((total, price) => total + price, 0)

    useEffect(() => {
        const fetchCart = async () => {
            if (user) {
                const userCartRef = collection(db, 'users', user.uid, 'cart');
                try {
                const cartSnapshot = await getDocs(userCartRef);
                const cartItems = cartSnapshot.docs.map((doc) => ({
                    id: doc.id,
                    ...doc.data(),
                }));
                setCart(cartItems);
                } catch (error) {
                console.error('Error fetching cart:', error);
                // Handle error (e.g., show a notification to the user)
                } finally {
                setLoading(false);
                }
            } else {
                // Fetch from localStorage when the user is not logged in
                fetchCartFromLocalStorage();
                setLoading(false);
            }
        };
      
        const unsubscribe = user
          ? onSnapshot(collection(db, 'users', user.uid, 'cart'), (snapshot) => {
            try {
                if (snapshot) {
                    const cartItems = snapshot.docs.map((doc) => ({
                        id: doc.id,
                        ...doc.data(),
                    }));
                    setCart(cartItems);
                } else {
                    // Handle the case when snapshot is null or undefined
                    console.error('Firestore snapshot is null or undefined.');
                }
              } catch (error) {
                console.error('Error processing Firestore snapshot:', error);
              }
            })
          : () => {};
      
        fetchCart();
    
        return () => {
          if (unsubscribe) {
            unsubscribe(); // Cleanup the listener on component unmount only if it exists
          }
        };
      }, [user]);

    const fetchCartFromLocalStorage = () => {
        const localCart = JSON.parse(localStorage.getItem('cart')) || [];
        setCart(localCart);
    };

    const saveCartToLocalStorage = (cartItems) => {
        localStorage.setItem('cart', JSON.stringify(cartItems));
    };

    const addToCart = async (product, quantity = 1) => {    
        try {
            if (user) {
                const cartItemDocRef = collection(db, `users/${user.uid}/cart`);
                const productRef = doc(cartItemDocRef, product.id);
    
                const cartItemDoc = await getDoc(productRef);
    
                if (cartItemDoc.exists()) {
                    // Update an existing document
                    const existingProduct = cartItemDoc.data();
                    const updatedProduct = {
                        ...existingProduct,
                        quantity: (existingProduct.quantity || 0) + quantity,
                    };
                    await updateCartItem(productRef, updatedProduct);
                } else {
                    // Create a new document
                    const newProduct = { ...product, quantity };
                    await addToCartItem(productRef, newProduct);
                }
                toast.success(`${product.name} agregado al carrito`);
            } else {
                const updatedCart = [...cart];
                const existingProductIndex = updatedCart.findIndex((item) => item.id === product.id);
    
                if (existingProductIndex !== -1) {
                    updatedCart[existingProductIndex].quantity += quantity;
                } else {
                    updatedCart.push({ ...product, quantity });
                }
                setCart(updatedCart);
                saveCartToLocalStorage(updatedCart);
                toast.success(`${product.name} agregado al carrito`);
            }
        } catch (error) {
            console.error('Error adding to cart:', error);
        }
    };

    const updateCartItem = async (productRef, product) => {
        try {
            await updateDoc(productRef, product);
        } catch (error) {
            console.error('Error updating cart item:', error);
        } finally {
            setLoading(false);
        }
    };
    
    const addToCartItem = async (productRef, product) => {
        try {
            await setDoc(productRef, product);
        } catch (error) {
            console.error('Error adding to cart:', error);
        } finally {
            setLoading(false);
        }
    };    

    const updateCartItemQuantity = async (product, newQuantity) => {
        try {
            if (user) {
                const cartItemDocRef = collection(db, `users/${user.uid}/cart`);
                const productRef = doc(cartItemDocRef, product.id);
                await updateDoc(productRef, { quantity: newQuantity });
                toast.success('Cantidad actualizada');
            } else {
                const updatedCart = cart.map((item) => {
                    if (item.id === product.id) {
                        return { ...item, quantity: newQuantity };
                    }
                    return item;
                });
                setCart(updatedCart);
                saveCartToLocalStorage(updatedCart);
                toast.success('Cantidad actualizada');
            }
        } catch (error) {
            console.error('Error updating cart item:', error);
        }
    };

    const removeFromCart = async (itemId) => {
        try {
            if (user) {
                const cartItemDocRef = collection(db, `users/${user.uid}/cart/`);
                const ProductRef = doc(cartItemDocRef, itemId);
    
                await deleteDoc(ProductRef);    
                const updatedLocalCart = cart.filter((item) => item.id !== itemId);
                saveCartToLocalStorage(updatedLocalCart);
                setCart(updatedLocalCart);    
                toast.success(`Eliminado del carrito`);
            } else {
                const updatedCart = cart.filter((item) => item.id !== itemId);
                setCart(updatedCart);
                saveCartToLocalStorage(updatedCart);
                toast.success(`Eliminado del carrito`);
            }
        } catch (error) {
            console.error('Error removing from cart:', error);
        }
    };

    const checkout = async (totalWithShipping, billingData) => {
        if (user && cart.length > 0) {
            const compraCollectionRef = collection(db, 'compras');
            const newCompraDocRef = doc(compraCollectionRef);
            const compraData = {
                user: [user.uid, user.email],
                Direccion: billingData,
                items: cart,
                total: totalWithShipping,
                timestamp: new Date(),
            };
            try {
                // Create a new document in 'compras' collection
                await setDoc(newCompraDocRef, compraData);
                const cartCollectionRef = collection(db, 'users', user.uid, 'cart');
                const deletePromises = cart.map((item) => {
                  const itemDocRef = doc(cartCollectionRef, item.id);
                  return deleteDoc(itemDocRef);
                });
                await Promise.all(deletePromises);

                // Clear the local cart state
                setCart([]);
                toast.success('Compra realizada con éxito');
            } catch (error) {
                console.error('Error during checkout:', error);
                toast.error('Error al realizar la compra');
            }
        } else if (cart.length <= 0) {
            toast.error('El carrito está vacío');
        } else if (!user) {
            toast.error('el usuario no está autenticado');
        }
    };

    const calculateTotalItems = (cartItems) => {
        return cartItems.reduce((total, item) => total + (item.quantity || 0), 0);
    };
    const totalItems = calculateTotalItems(cart)

    return (
        <CartContext.Provider value={{ cart, addToCart, removeFromCart, totalItems, updateCartItemQuantity, fetchCartFromLocalStorage, checkout, totalPrice }}>
          {children}
        </CartContext.Provider>
      );
}

export const useCart = () => {
    return useContext(CartContext)
}